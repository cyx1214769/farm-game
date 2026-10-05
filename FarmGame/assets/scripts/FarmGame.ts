import { _decorator, Component, Node, Label, Graphics, Color, UITransform, sys, Layers, input, Input, EventTouch, resources, SpriteFrame, Texture2D } from 'cc';
import { CROPS, CropData, findCrop } from './CropConfig';
import { Plot } from './Plot';
import { SeedBar } from './SeedBar';
import { MarketPanel } from './MarketPanel';
import { OrderPanel, OrderData, OrderItem } from './OrderPanel';
import { ConfirmPanel } from './ConfirmPanel';
import { Scenery } from './Scenery';
import { InputGuard } from './InputGuard';
import {
    findAnimal, PEN_FENCES, PEN_COUNT, PEN_CAP_START, PEN_CAP_MAX, PEN_CAP_STEP,
    penAnimalId,
} from './AnimalConfig';
import { findItem, allItemIds } from './Items';
import { PastureScene, PenView, PenFenceView } from './PastureScene';
import { AnimalSheet } from './AnimalSheet';

// 微信小游戏的全局对象。浏览器预览时不存在，所以用 typeof 判断。
declare const wx: any;

const { ccclass } = _decorator;

// ------- 布局参数：想调地块大小和间距，改这里 -------
const TILE_W = 150;              // 菱形地块的宽
const TILE_H = TILE_W * 0.5;     // 2:1 菱形 ≈ 30° 俯角

// 田地是 6×6 = 36 格。中间沿十字留一条窄缝，分成 4 个 3×3 方块
const BLOCK_SIZE = 3;
const BLOCK_GAP = 0.3;           // 十字缝宽度（以格为单位）

// 地图尺寸（比屏幕大，玩家可以拖动看边缘）
const MAP_W = 1600;
const MAP_H = 2000;

// 双指缩放的范围 —— 不用太多，能微调就行
const MIN_ZOOM = 0.85;
const MAX_ZOOM = 1.25;

// ---------------- 牧场 ----------------

/**
 * 老存档（那时是"鸡3羊3牛3、两排、逐个开垦"）里的栏位下标 → 现在的下标。
 * 现在每个围栏是自己一块：0~5 鸡栏、6~11 羊栏、12~17 牛栏。
 */
function oldPenToNew(oldIndex: number): number {
    const row = oldIndex < 9 ? 0 : 1;
    const base = oldIndex < 9 ? oldIndex : oldIndex - 9;
    const fence = Math.floor(base / 3);
    const col = base % 3;
    return fence * PEN_CAP_MAX + row * 3 + col;
}

function oldPenFence(oldIndex: number): number {
    const base = oldIndex < 9 ? oldIndex : oldIndex - 9;
    return Math.floor(base / 3);
}

function clampInt(v: number, lo: number, hi: number): number {
    return v < lo ? lo : (v > hi ? hi : v);
}

/** 一个栏位的状态 */
interface PenData {
    /** 空着就是 '' */
    animalId: string;
    /** 买回来的时间戳（毫秒）—— 用来算它长大没 */
    bornAt: number;
    /** 已经成年了吗（成年才能喂、能收、能卖） */
    matured: boolean;
    /** 还能产几个（0 = 饿了） */
    fullness: number;
    /** 攒了几个没被收走 */
    stored: number;
    /** 当前这个已经产了多久（秒） */
    elapsed: number;
    /** 上次结算的时间戳（毫秒），用来算离线产出 */
    lastTime: number;
}

/** 开局金币（测试期给多一点，正式版改回 120 左右） */
const START_COINS = 10000;
const SAVE_KEY = 'farm_save_v7';

/**
 * 要不要用真贴图。
 *
 * false = 回到"代码画色块"的版本（美术还没定稿时先关着）
 * true  = 用 assets/resources/art/ 里的图
 *
 * 想切换只改这一行，别的代码不用动。素材一直留在项目里，不会丢。
 */
const USE_ART = true;

// 开局送几"行"（一行就是 3 格），顺序是「上、左、右、下」
// 上面那块送 2 行（6 格），左边那块送 1 行（3 格），一共 9 格
const FREE_ROWS_PER_BLOCK = [2, 1, 0, 0];

// 开垦价：第 n 块要开的地，比上一块贵 16%
function unlockPrice(index: number): number {
    return Math.round((80 * Math.pow(1.16, index)) / 10) * 10;
}

// 种下后多少秒内拔掉可以全额退款（手滑保护）
const FREE_REMOVE_SECONDS = 3;

/**
 * 游戏主控。
 * 挂在 Canvas 节点上就能跑，场景里其他东西全用代码生成，不用手动搭。
 */
@ccclass('FarmGame')
export class FarmGame extends Component {
    private coinLabel: Label = null!;
    private plots: Plot[] = [];
    private coins = START_COINS;
    private savedPlots: any[] = [];
    /** 玩家当前选中的作物，默认第一种 */
    private selected: CropData = CROPS[0];
    /** 仓库：作物 id -> 数量 */
    private inventory: Record<string, number> = {};
    private marketPanel: MarketPanel = null!;
    private orderPanel: OrderPanel = null!;
    private marketButtonLabel: Label = null!;
    private orderButtonLabel: Label = null!;
    private toastRoot: Node = null!;
    private toastLabel: Label = null!;
    private seedBar: SeedBar = null!;
    private confirmPanel: ConfirmPanel = null!;
    private animalSheet: AnimalSheet = null!;
    private pastureScene: PastureScene = null!;
    private scenery: Scenery = null!;
    /** 装"世界"的容器：风景和地块都放里面，拖动就是移动它 */
    private world: Node = null!;

    // ---- 牧场 ----
    private pens: PenData[] = [];
    /** 每个围栏现在能养几只（下标 = 第几个围栏） */
    private penCap: number[] = [];
    /** 面板开着的时候，用来控制刷新频率（秒） */
    private panelTimer = 0;
    /** 上一次刷新的状态签名 —— 没变就不重建节点 */
    private penSignature = '';

    // ---- 拖动状态 ----
    private dragging = false;
    // 用一个"不可能出现"的值当哨兵：一旦发现还是它，就说明没收到手势开始的事件
    private dragStartX = -99999;
    private dragStartY = -99999;
    private worldStartX = 0;
    private worldStartY = 0;
    /** 当前缩放（1 = 原始大小） */
    private zoom = 1;
    /** 屏幕上按着的手指 */
    private touches: { id: number; x: number; y: number }[] = [];
    /** 双指捏合时，上一帧两指的距离 */
    private pinchDist = 0;
    /** 当前挂着的订单 */
    private orders: OrderData[] = [];
    private nextOrderId = 1;
    /** 右上角那两个按钮（进牧场时要缩小挪位置，所以得记住它们） */
    private topButtons: { node: Node; x: number; y: number; smallX: number }[] = [];
    /** 载入好的贴图（键 = 文件名，不带扩展名） */
    private artFrames: Record<string, SpriteFrame> = {};

    start() {
        this.loadSave();
        this.buildBackground();
        this.buildWorld();
        this.buildScenery();
        this.buildHUD();
        this.buildField();
        this.loadArt();
        this.buildSeedBar();
        // 牧场要排在市场/订单面板前面建 —— 不然在牧场里点「市场」，
        // 面板其实已经打开了，只是被牧场盖住，看着像没反应
        this.buildPastureScene();
        this.buildMarket();
        this.buildOrderPanel();
        this.buildTopButtons();
        // 小面板要排在提示条和确认框下面 —— 卖动物时会从小面板里弹确认框
        this.buildAnimalSheet();
        this.buildToast();
        this.buildConfirmPanel();
        this.restorePlots();
        this.ensureOrders();
        this.normalizePens();
        this.tickPens(Date.now());
        this.refreshHUD();
        this.setupDrag();
    }

    /** 每帧跑一下：让动物继续产出（关掉游戏时靠时间戳补算） */
    update(dt: number) {
        if (!this.world) {
            return;
        }
        this.tickPens(Date.now());

        // 牧场开着的时候每秒刷一次（让"长大中"那条进度条往前走）
        if (this.pastureScene && this.pastureScene.node.active) {
            this.panelTimer += dt;
            if (this.panelTimer >= 1) {
                this.panelTimer = 0;
                this.refreshPasture();
            }
        }
    }

    // ================= 场景搭建 =================

    private get canvasWidth(): number {
        const t = this.node.getComponent(UITransform);
        return t ? t.contentSize.width : 720;
    }

    private get canvasHeight(): number {
        const t = this.node.getComponent(UITransform);
        return t ? t.contentSize.height : 1280;
    }

    /**
     * 屏幕顶部"不能用"的高度（刘海、状态栏、微信胶囊按钮），单位是画布像素。
     * 所有顶部 UI 都要排在它下面，否则会被系统元素盖住、甚至误触。
     */
    private topSafeInset(): number {
        if (typeof wx === 'undefined' || !wx.getMenuButtonBoundingClientRect || !wx.getSystemInfoSync) {
            return 60; // 浏览器预览时的默认值
        }
        try {
            const menu = wx.getMenuButtonBoundingClientRect();
            const info = wx.getSystemInfoSync();
            const screenH = info.windowHeight || info.screenHeight || 0;
            if (screenH > 0 && menu && menu.bottom > 0) {
                // 屏幕坐标（pt）换算成画布坐标
                return menu.bottom * (this.canvasHeight / screenH) + 16;
            }
        } catch (e) {
            // 拿不到就用默认值，不要让游戏崩
        }
        return 60;
    }

    private buildBackground() {
        const w = this.canvasWidth;
        const h = this.canvasHeight;

        const node = new Node('Background');
        node.parent = this.node;
        node.layer = Layers.Enum.UI_2D;

        const g = node.addComponent(Graphics);
        g.fillColor = new Color(122, 176, 104, 255); // 草地绿
        g.rect(-w / 2, -h / 2, w, h);
        g.fill();
    }

    /** 世界容器：风景和地块都挂在它下面，拖动时移动它就行 */
    private buildWorld() {
        this.world = new Node('World');
        this.world.parent = this.node;
        this.world.layer = Layers.Enum.UI_2D;
        this.world.setPosition(0, 0, 0);
    }

    /** 农场里的风景：房子、树、水井、风车、牧场、水塘、小路（占位色块） */
    private buildScenery() {
        const node = new Node('Scenery');
        node.parent = this.world;
        node.layer = Layers.Enum.UI_2D;

        this.scenery = node.addComponent(Scenery);
        this.scenery.onPastureClick = () => this.openPasture();
        this.scenery.build();
    }

    private buildPastureScene() {
        const sceneNode = new Node('PastureScene');
        sceneNode.parent = this.node;
        sceneNode.layer = Layers.Enum.UI_2D;

        this.pastureScene = sceneNode.addComponent(PastureScene);
        this.pastureScene.build(this.canvasWidth, this.canvasHeight, this.topSafeInset());
        this.pastureScene.onBuyAnimal = (f: number) => this.buyAnimal(f);
        this.pastureScene.onExpand = (f: number) => this.expandPen(f);
        this.pastureScene.onPenTap = (i: number) => this.onPenTap(i);
        this.pastureScene.onAnimalTap = (i: number) => this.openAnimalSheet(i);
        this.pastureScene.onFeedAll = () => this.feedAll();
        this.pastureScene.onCollectAll = () => this.collectAll();
        this.pastureScene.onClose = () => this.closePasture();
    }

    // ================= 牧场 =================

    private openPasture() {
        this.tickPens(Date.now());
        this.applyTopButtons(true);
        this.refreshPasture();
        this.pastureScene.setVisible(true);
    }

    private closePasture() {
        this.pastureScene.setVisible(false);
        if (this.animalSheet) {
            this.animalSheet.hide();
        }
        this.applyTopButtons(false);
    }

    /** 存档里可能缺字段，在这里补齐（顺便把老存档搬过来） */
    private normalizePens() {
        const now = Date.now();
        const oldPens: any[] = this.pens || [];
        const list: PenData[] = [];

        for (let i = 0; i < PEN_COUNT; i++) {
            const src: any = oldPens[i] ? oldPens[i] : null;

            // 位置和动物对不上的，清掉重来
            const expected = penAnimalId(i);
            let animalId = src && src.animalId ? src.animalId : '';
            if (animalId && animalId !== expected) {
                animalId = '';
            }

            const hasBorn = src && typeof src.bornAt === 'number' && src.bornAt > 0;
            list.push({
                animalId: animalId,
                bornAt: hasBorn ? src.bornAt : (animalId ? now : 0),
                // 老存档里的动物都算成年（改版前没有"幼年"这回事）
                matured: animalId
                    ? (src && typeof src.matured === 'boolean' ? src.matured : true)
                    : false,
                fullness: src && typeof src.fullness === 'number' ? src.fullness : 0,
                stored: src && typeof src.stored === 'number' ? src.stored : 0,
                elapsed: src && typeof src.elapsed === 'number' ? src.elapsed : 0,
                lastTime: src && typeof src.lastTime === 'number' ? src.lastTime : now,
            });
        }
        this.pens = list;

        // 每一栏能养几只：至少开局 3 只，而且已经养着的动物不能被挤掉
        const caps: number[] = [];
        for (let f = 0; f < PEN_FENCES.length; f++) {
            let count = 0;
            for (let s = 0; s < PEN_CAP_MAX; s++) {
                if (list[f * PEN_CAP_MAX + s].animalId) {
                    count++;
                }
            }
            const saved = this.penCap && typeof this.penCap[f] === 'number' ? this.penCap[f] : PEN_CAP_START;
            caps.push(clampInt(Math.max(saved, count), PEN_CAP_START, PEN_CAP_MAX));
        }
        this.penCap = caps;
    }

    /**
     * 让动物继续产出。
     * 关键：用"上次结算的时间戳"算差值 —— 所以关掉游戏的时候它们也在产。
     */
    private tickPens(now: number) {
        let changed = false;
        let somethingReady = false;

        for (let i = 0; i < this.pens.length; i++) {
            const pen = this.pens[i];
            if (!pen.animalId) {
                pen.lastTime = now;
                continue;
            }
            const animal = findAnimal(pen.animalId);
            if (!animal) {
                pen.lastTime = now;
                continue;
            }

            const dt = (now - pen.lastTime) / 1000;
            pen.lastTime = now;

            // 幼崽 → 成年：按"买回来的时间戳"算，所以关掉游戏也在长大
            if (!pen.matured && pen.bornAt > 0 && now - pen.bornAt >= animal.growUpSeconds * 1000) {
                pen.matured = true;
                changed = true;
            }

            if (dt > 0) {
                const cap = animal.feedTimes;
                // 只有成年的动物才会产出
                if (pen.matured && pen.fullness > 0 && pen.stored < cap) {
                    pen.elapsed += dt;
                    while (pen.elapsed >= animal.growSeconds && pen.fullness > 0 && pen.stored < cap) {
                        pen.elapsed -= animal.growSeconds;
                        pen.fullness--;
                        pen.stored++;
                        changed = true;
                    }
                }
            }
            if (pen.stored > 0) {
                somethingReady = true;
            }
        }

        if (changed) {
            this.save();
        }
        if (this.scenery) {
            this.scenery.setPastureBadge(somethingReady);
        }
    }

    /** 把牧场的状态整理成"三个围栏，每个围栏里有几只动物" */
    private buildFenceViews(): PenFenceView[] {
        const list: PenFenceView[] = [];

        for (let f = 0; f < PEN_FENCES.length; f++) {
            const fence = PEN_FENCES[f];
            const cap = this.penCap[f] || PEN_CAP_START;
            const animals: PenView[] = [];

            for (let s = 0; s < cap; s++) {
                const i = f * PEN_CAP_MAX + s;
                const pen = this.pens[i];
                if (!pen || !pen.animalId) {
                    continue;
                }
                const animal = findAnimal(pen.animalId);
                const progress = animal && animal.growUpSeconds > 0
                    ? (Date.now() - pen.bornAt) / 1000 / animal.growUpSeconds
                    : 1;
                animals.push({
                    index: i,
                    young: !pen.matured,
                    growProgress: progress,
                    stored: pen.stored,
                    fullness: pen.fullness,
                });
            }

            list.push({
                animalId: fence.animalId,
                cap: cap,
                count: animals.length,
                expandPrice: fence.expandPrice,
                canExpand: cap < PEN_CAP_MAX,
                animals: animals,
            });
        }
        return list;
    }

    private refreshPasture() {
        if (!this.pastureScene) {
            return;
        }
        const fences = this.buildFenceViews();

        // 状态没变就不重建 —— 不然每次刷新都在造/销毁一堆节点，白白浪费
        const parts: string[] = [`${this.coins}`];
        for (let i = 0; i < fences.length; i++) {
            const f = fences[i];
            parts.push(`${f.cap}|${f.count}`);
            for (let k = 0; k < f.animals.length; k++) {
                const a = f.animals[k];
                // 幼崽的进度按 5% 一档，避免每帧都重建（长大中那条进度条够用就行）
                const step = a.young ? Math.floor(a.growProgress * 20) : 0;
                parts.push(`${a.index}:${a.young ? 1 : 0}:${step}:${a.stored}:${a.fullness}`);
            }
        }
        const sig = parts.join(',');
        if (sig === this.penSignature) {
            return;
        }
        this.penSignature = sig;
        this.pastureScene.refresh(fences, this.coins, this.stockCount());
    }

    /** 仓库里一共有多少件东西（牧场顶部显示用） */
    private stockCount(): number {
        let total = 0;
        for (const id in this.inventory) {
            total += this.inventory[id] || 0;
        }
        return total;
    }

    // ---- 牧场：玩家动作 ----

    /** 买动物：价格固定，位置从这一栏里找第一个空的（价格不随位置涨） */
    private buyAnimal(fenceIndex: number) {
        if (fenceIndex < 0 || fenceIndex >= PEN_FENCES.length) {
            return;
        }
        const fence = PEN_FENCES[fenceIndex];
        const animal = findAnimal(fence.animalId);
        if (!animal) {
            return;
        }

        const cap = this.penCap[fenceIndex] || PEN_CAP_START;
        let slot = -1;
        for (let s = 0; s < cap; s++) {
            const i = fenceIndex * PEN_CAP_MAX + s;
            if (this.pens[i] && !this.pens[i].animalId) {
                slot = i;
                break;
            }
        }
        if (slot < 0) {
            this.toast(`${animal.name}栏满了，先扩建`);
            return;
        }
        if (this.coins < animal.buyPrice) {
            this.toast(`金币不够，一只${animal.name}要 ${animal.buyPrice} 金币`);
            return;
        }

        this.confirmPanel.show(
            `买一只${animal.name}？`,
            `${animal.buyPrice} 金币 · 买来是幼崽，养大才能卖或者产${animal.productName}`,
            '买下',
            () => this.doBuyAnimal(fenceIndex, slot)
        );
    }

    private doBuyAnimal(fenceIndex: number, penIndex: number) {
        const fence = PEN_FENCES[fenceIndex];
        const animal = findAnimal(fence.animalId);
        const pen = this.pens[penIndex];
        if (!animal || !pen || pen.animalId || this.coins < animal.buyPrice) {
            return;
        }

        this.coins -= animal.buyPrice;
        pen.animalId = animal.id;
        pen.bornAt = Date.now();
        pen.matured = false;
        pen.fullness = 0;
        pen.stored = 0;
        pen.elapsed = 0;
        pen.lastTime = Date.now();

        this.refreshHUD();
        this.refreshPasture();
        this.save();
        this.toast(`${animal.name}住进来了，它还是幼崽`);
    }

    /** 扩建：花一笔钱，这一栏能养的数量 +3（最多 6） */
    private expandPen(fenceIndex: number) {
        if (fenceIndex < 0 || fenceIndex >= PEN_FENCES.length) {
            return;
        }
        const fence = PEN_FENCES[fenceIndex];
        const animal = findAnimal(fence.animalId);
        const cap = this.penCap[fenceIndex] || PEN_CAP_START;
        if (!animal || cap >= PEN_CAP_MAX) {
            return;
        }

        const cost = fence.expandPrice;
        if (this.coins < cost) {
            this.toast(`扩建要 ${cost} 金币`);
            return;
        }

        this.confirmPanel.show(
            `扩建${animal.name}栏？`,
            `${cost} 金币，能养的数量从 ${cap} 只变成 ${cap + PEN_CAP_STEP} 只`,
            '扩建',
            () => {
                if (this.coins < cost || this.penCap[fenceIndex] >= PEN_CAP_MAX) {
                    return;
                }
                this.coins -= cost;
                this.penCap[fenceIndex] = clampInt(
                    this.penCap[fenceIndex] + PEN_CAP_STEP, PEN_CAP_START, PEN_CAP_MAX
                );
                this.refreshHUD();
                this.refreshPasture();
                this.save();
                this.toast(`${animal.name}栏扩建好了，现在能养 ${this.penCap[fenceIndex]} 只`);
            }
        );
    }

    /**
     * 卖掉一只动物：换来一份肉，进仓库（不是直接给金币）。
     * 没收获的产物会先自动收进仓库，不浪费。
     */
    private sellAnimal(penIndex: number) {
        const pen = this.pens[penIndex];
        if (!pen || !pen.animalId) {
            return;
        }
        const animal = findAnimal(pen.animalId);
        if (!animal) {
            return;
        }
        if (!pen.matured) {
            this.toast(`${animal.name}还是幼崽，长大才能卖`);
            return;
        }

        const collected = this.tryCollect(penIndex);
        this.inventory[animal.meatId] = (this.inventory[animal.meatId] || 0) + 1;

        pen.animalId = '';
        pen.bornAt = 0;
        pen.matured = false;
        pen.fullness = 0;
        pen.stored = 0;
        pen.elapsed = 0;
        pen.lastTime = Date.now();

        this.animalSheet.hide();
        this.refreshHUD();
        this.refreshPasture();
        this.save();

        const extra = collected > 0 ? `（先收了 ${collected} 个${animal.productName}）` : '';
        this.toast(`卖掉一只${animal.name}，换到 1 份${animal.meatName}${extra}`);
    }

    /** 点动物弹出来的小面板：喂食 / 收获 / 卖掉换肉 */
    private openAnimalSheet(penIndex: number) {
        const pen = this.pens[penIndex];
        if (!pen || !pen.animalId) {
            return;
        }
        const animal = findAnimal(pen.animalId);
        if (!animal) {
            return;
        }

        const young = !pen.matured;
        const hasProduct = pen.stored > 0;
        const hungry = !young && !hasProduct && pen.fullness <= 0;

        let status = `正在产${animal.productName}`;
        if (young) {
            const left = Math.max(0, animal.growUpSeconds - Math.floor((Date.now() - pen.bornAt) / 1000));
            status = `幼崽 · 还要 ${left} 秒长大`;
        } else if (hungry) {
            status = `饿了 · 喂一次就能继续产${animal.productName}`;
        } else if (hasProduct) {
            status = `攒了 ${pen.stored} 个${animal.productName}`;
        }

        this.animalSheet.onFeed = () => {
            if (!this.tryFeed(penIndex)) {
                this.toast(`饲料要 ${animal.feedPrice} 金币`);
                return;
            }
            this.refreshHUD();
            this.refreshPasture();
            this.save();
            this.openAnimalSheet(penIndex);
        };
        this.animalSheet.onCollect = () => {
            const got = this.tryCollect(penIndex);
            if (got <= 0) {
                return;
            }
            this.refreshHUD();
            this.refreshPasture();
            this.save();
            this.toast(`收了 ${got} 个${animal.productName}`);
            this.openAnimalSheet(penIndex);
        };
        this.animalSheet.onSell = () => {
            this.confirmPanel.show(
                `卖掉这只${animal.name}？`,
                `换到 1 份${animal.meatName}（进仓库），栏位会空出来`,
                '卖掉',
                () => this.sellAnimal(penIndex)
            );
        };

        this.animalSheet.show({
            title: `这只${animal.name}`,
            status: status,
            feedText: `喂食 ${animal.feedPrice} 金币`,
            feedEnabled: !young && !hasProduct && pen.fullness < animal.feedTimes,
            collectText: hasProduct ? `收获 ${pen.stored} 个` : '还没得收',
            collectEnabled: hasProduct,
            sellText: young ? '长大之后才能卖' : `卖掉换${animal.meatName} · ${animal.meatPrice} 金币`,
            sellEnabled: !young,
        });
    }

    private tryFeed(penIndex: number): boolean {
        const pen = this.pens[penIndex];
        if (!pen || !pen.animalId) {
            return false;
        }
        const animal = findAnimal(pen.animalId);
        if (!animal || !pen.matured || pen.fullness >= animal.feedTimes || this.coins < animal.feedPrice) {
            return false;
        }
        this.coins -= animal.feedPrice;
        pen.fullness = animal.feedTimes;
        pen.lastTime = Date.now();
        return true;
    }

    private tryCollect(penIndex: number): number {
        const pen = this.pens[penIndex];
        if (!pen || !pen.animalId || !pen.matured || pen.stored <= 0) {
            return 0;
        }
        const animal = findAnimal(pen.animalId);
        if (!animal) {
            return 0;
        }
        const got = pen.stored;
        pen.stored = 0;
        this.inventory[animal.productId] = (this.inventory[animal.productId] || 0) + got;
        return got;
    }

    /** 点了有动物的栏位：有产物先收，没有就喂 */
    private onPenTap(penIndex: number) {
        const pen = this.pens[penIndex];
        if (!pen || !pen.animalId) {
            return;
        }
        const animal = findAnimal(pen.animalId);
        if (!animal) {
            return;
        }

        // 幼崽不能喂也不能收
        if (!pen.matured) {
            const left = Math.max(0, animal.growUpSeconds - Math.floor((Date.now() - pen.bornAt) / 1000));
            this.toast(`${animal.name}还是幼崽，还要 ${left} 秒长大`);
            return;
        }

        if (pen.stored > 0) {
            const got = this.tryCollect(penIndex);
            this.refreshHUD();
            this.refreshPasture();
            this.save();
            this.toast(`收了 ${got} 个${animal.productName}`);
            return;
        }

        if (pen.fullness >= animal.feedTimes) {
            return;
        }
        if (!this.tryFeed(penIndex)) {
            this.toast(`饲料要 ${animal.feedPrice} 金币`);
            return;
        }
        this.refreshHUD();
        this.refreshPasture();
        this.save();
    }

    private feedAll() {
        let count = 0;
        for (let f = 0; f < PEN_FENCES.length; f++) {
            const cap = this.penCap[f] || PEN_CAP_START;
            for (let s = 0; s < cap; s++) {
                if (this.tryFeed(f * PEN_CAP_MAX + s)) {
                    count++;
                }
            }
        }
        if (count === 0) {
            this.toast('没有需要喂的，或者金币不够');
            return;
        }
        this.refreshHUD();
        this.refreshPasture();
        this.save();
        this.toast(`喂了 ${count} 只`);
    }

    private collectAll() {
        let total = 0;
        for (let f = 0; f < PEN_FENCES.length; f++) {
            const cap = this.penCap[f] || PEN_CAP_START;
            for (let s = 0; s < cap; s++) {
                total += this.tryCollect(f * PEN_CAP_MAX + s);
            }
        }
        if (total === 0) {
            this.toast('还没有东西可以收');
            return;
        }
        this.refreshHUD();
        this.refreshPasture();
        this.save();
        this.toast(`收了 ${total} 个产物`);
    }

    private buildAnimalSheet() {
        const panelNode = new Node('AnimalSheet');
        panelNode.parent = this.node;
        panelNode.layer = Layers.Enum.UI_2D;

        this.animalSheet = panelNode.addComponent(AnimalSheet);
        this.animalSheet.build();
    }

    private buildHUD() {
        const node = new Node('CoinLabel');
        node.parent = this.node;
        node.layer = Layers.Enum.UI_2D;

        const t = node.addComponent(UITransform);
        t.setContentSize(440, 90);

        this.coinLabel = node.addComponent(Label);
        this.coinLabel.fontFamily = 'Microsoft YaHei';
        this.coinLabel.fontSize = 34;
        this.coinLabel.lineHeight = 44;
        this.coinLabel.color = new Color(255, 255, 255, 255);
        this.coinLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this.coinLabel.verticalAlign = Label.VerticalAlign.CENTER;

        // HUD 挪到左上角，把右上角让给「市场」按钮
        node.setPosition(-this.canvasWidth / 2 + 240, this.canvasHeight / 2 - this.topSafeInset() - 45, 0);
    }

    private buildField() {
        const halfW = TILE_W / 2;
        const halfH = TILE_H / 2;

        // 4 个 3×3 方块，中间沿十字留一条窄缝
        // （等距投影下，网格的两个方向就是画面上的那个 X）
        // 每个方块单独编号 —— 这样才好按方块决定送几行
        const cells: { cc: number; rr: number; depth: number; block: number; row: number }[] = [];
        for (let qc = 0; qc < 2; qc++) {
            for (let qr = 0; qr < 2; qr++) {
                const blockIndex = qc * 2 + qr;
                for (let r = 0; r < BLOCK_SIZE; r++) {
                    for (let c = 0; c < BLOCK_SIZE; c++) {
                        const cc = c + qc * (BLOCK_SIZE + BLOCK_GAP);
                        const rr = r + qr * (BLOCK_SIZE + BLOCK_GAP);
                        cells.push({
                            cc: cc,
                            rr: rr,
                            depth: cc + rr,
                            block: blockIndex,
                            row: r,
                        });
                    }
                }
            }
        }
        cells.sort((a, b) => a.depth - b.depth);

        // 整块田的中心（以格为单位），用来把整片地摆正
        const mid = (BLOCK_SIZE - 1) + (BLOCK_SIZE + BLOCK_GAP);

        let paid = 0;   // 已经安排过价格的格子数

        for (let i = 0; i < cells.length; i++) {
            const cell = cells[i];
            const node = new Node(`Plot_${i}`);
            node.parent = this.world;
            node.layer = Layers.Enum.UI_2D;

            // 等距排列：横着走是往右下，竖着走是往左下
            const x = (cell.cc - cell.rr) * halfW;
            const y = -(cell.cc + cell.rr) * halfH + mid * halfH;
            node.setPosition(x, y, 0);

            const plot = node.addComponent(Plot);
            plot.init(TILE_W);
            plot.onClicked = (p) => this.handlePlotClick(p);

            // 地块要把触摸转发给主控 —— 不然在地块上拖不动地图
            plot.onPressStart = (e) => this.onDragStart(e);
            plot.onPressMove = (e) => this.onDragMove(e);
            plot.onPressEnd = (e) => this.onDragEnd(e);

            // 这个方块送几行 —— 送的是方块里最前面的那几行
            const freeRows = cell.block < FREE_ROWS_PER_BLOCK.length ? FREE_ROWS_PER_BLOCK[cell.block] : 0;
            if (cell.row < freeRows) {
                plot.setLocked(false, 0);
            } else {
                plot.setLocked(true, unlockPrice(paid));
                paid++;
            }

            this.plots.push(plot);
        }
    }

    private restorePlots() {
        for (let i = 0; i < this.plots.length; i++) {
            const s = this.savedPlots[i];
            if (!s) {
                continue;
            }

            // 先恢复"开没开垦"
            if (s.unlocked === true) {
                this.plots[i].unlock();
            }

            // 再恢复"地里种了什么"
            if (!s.id) {
                continue;
            }
            const crop = findCrop(s.id);
            if (!crop) {
                continue;
            }
            // 用"种下的时间戳"反推已经长了多久 —— 关掉游戏也在长
            const elapsed = (Date.now() - s.at) / 1000;
            this.plots[i].restore(crop, Math.max(0, elapsed));
        }
    }

    /**
     * 载入真贴图（图放在 assets/resources/art/ 里）。
     *
     * 载不到就什么都不做 —— 地块继续画色块，所以：
     * 少一张图、或者图片名字写错，都不会让游戏崩，只是那部分还是色块。
     */
    private loadArt() {
        if (!USE_ART) {
            return;   // 关了贴图 → 全部走色块
        }

        const names: string[] = ['plot_soil'];
        for (let i = 0; i < CROPS.length; i++) {
            const art = CROPS[i].art;
            if (art) {
                for (let k = 0; k < art.length; k++) {
                    names.push(art[k].name);
                }
            }
        }

        for (let i = 0; i < names.length; i++) {
            this.loadArtFrame(names[i]);
        }
    }

    /**
     * 载一张图，拿到 SpriteFrame。
     *
     * 图片被 Cocos 导入成哪种类型是会影响子资源名字的：
     *   - "sprite-frame" 类型 → 子资源叫 art/xxx/spriteFrame
     *   - "texture" 类型       → 没有 spriteFrame，只有 art/xxx/texture
     * 所以这里两种都试一遍，最后那种自己拼一个 SpriteFrame 出来 ——
     * 这样不管图片怎么导入都不会白忙。
     */
    private loadArtFrame(name: string) {
        resources.load(`art/${name}/spriteFrame`, SpriteFrame, (err, frame) => {
            if (!err && frame) {
                this.artFrames[name] = frame;
                this.applyArt();
                return;
            }

            resources.load(`art/${name}/texture`, Texture2D, (err2, tex) => {
                if (err2 || !tex) {
                    // 实在没有就继续用色块，并留一条日志方便排查
                    console.warn(`[美术] 没载到 art/${name}，这部分继续用色块画`);
                    return;
                }
                const made = new SpriteFrame();
                made.texture = tex;
                this.artFrames[name] = made;
                this.applyArt();
            });
        });
    }

    /** 把载好的贴图交给每一块地 */
    private applyArt() {
        const soil = this.artFrames['plot_soil'] || null;
        for (let i = 0; i < this.plots.length; i++) {
            this.plots[i].setArt(soil, this.artFrames);
        }
    }

    private buildSeedBar() {
        const node = new Node('SeedBar');
        node.parent = this.node;
        node.layer = Layers.Enum.UI_2D;

        this.seedBar = node.addComponent(SeedBar);
        this.seedBar.onSelect = (index: number) => {
            const crop = CROPS[index];
            this.selected = crop;
            // 选了个买不起的，直接说清楚
            if (this.coins < crop.seedCost) {
                this.toast(`金币不够，需要 ${crop.seedCost} 金币`);
            }
        };
        this.seedBar.build(-this.canvasHeight / 2 + 110);
    }

    private buildMarket() {
        const panelNode = new Node('MarketPanel');
        panelNode.parent = this.node;
        panelNode.layer = Layers.Enum.UI_2D;

        this.marketPanel = panelNode.addComponent(MarketPanel);
        this.marketPanel.build();
        this.marketPanel.onSellCrop = (id: string) => this.sellCrop(id);
        this.marketPanel.onSellAll = () => this.sellAll();
        this.marketPanel.onClose = () => this.marketPanel.setVisible(false);
    }

    private buildOrderPanel() {
        const panelNode = new Node('OrderPanel');
        panelNode.parent = this.node;
        panelNode.layer = Layers.Enum.UI_2D;

        this.orderPanel = panelNode.addComponent(OrderPanel);
        this.orderPanel.build();
        this.orderPanel.onDeliver = (id: number) => this.deliverOrder(id);
        this.orderPanel.onClose = () => this.orderPanel.setVisible(false);
    }

    /** 右上角那排按钮：市场、订单 */
    private buildTopButtons() {
        this.marketButtonLabel = this.makeTopButton('市场', 0, () => this.openMarket());
        this.orderButtonLabel = this.makeTopButton('订单', 1, () => this.openOrders());
    }

    private makeTopButton(text: string, slot: number, onClick: () => void): Label {
        const w = 200;
        const h = 78;
        const x = this.canvasWidth / 2 - w / 2 - 24;
        const y = this.canvasHeight / 2 - this.topSafeInset() - 45 - slot * 100;

        const btn = new Node(`TopBtn_${text}`);
        btn.parent = this.node;
        btn.layer = Layers.Enum.UI_2D;
        btn.addComponent(UITransform).setContentSize(w, h);
        btn.setPosition(x, y, 0);

        const bg = new Node('Bg');
        bg.parent = btn;
        bg.layer = Layers.Enum.UI_2D;
        const g = bg.addComponent(Graphics);
        g.fillColor = new Color(96, 74, 52, 255);
        g.roundRect(-w / 2, -h / 2, w, h, 14);
        g.fill();

        const textNode = new Node('Text');
        textNode.parent = btn;
        textNode.layer = Layers.Enum.UI_2D;
        textNode.addComponent(UITransform).setContentSize(w, h);
        const lb = textNode.addComponent(Label);
        lb.fontFamily = 'Microsoft YaHei';
        lb.fontSize = 28;
        lb.lineHeight = 34;
        lb.color = new Color(255, 246, 228, 255);
        lb.horizontalAlign = Label.HorizontalAlign.CENTER;
        lb.verticalAlign = Label.VerticalAlign.CENTER;
        lb.string = text;

        btn.on(Node.EventType.TOUCH_END, () => {
            if (!InputGuard.blocked()) {
                onClick();
            }
        }, this);

        // 记下来：进牧场的时候要把它缩小挪到围栏上方
        this.topButtons.push({ node: btn, x: x, y: y, smallX: 30 + slot * 140 });
        return lb;
    }

    /**
     * 牧场是全屏的，这两个按钮本来会压在鸡栏上 ——
     * 进牧场时缩小、挪到围栏上方，出来再放回原位。
     */
    private applyTopButtons(inPasture: boolean) {
        const topY = this.canvasHeight / 2 - this.topSafeInset() - 26;
        for (let i = 0; i < this.topButtons.length; i++) {
            const b = this.topButtons[i];
            if (inPasture) {
                b.node.setScale(0.68, 0.68, 1);
                b.node.setPosition(b.smallX, topY, 0);
            } else {
                b.node.setScale(1, 1, 1);
                b.node.setPosition(b.x, b.y, 0);
            }
        }
    }

    private openMarket() {
        this.marketPanel.refresh(this.inventory);
        this.marketPanel.setVisible(true);
    }

    private openOrders() {
        this.orderPanel.refresh(this.orders, this.inventory);
        this.orderPanel.setVisible(true);
    }

    private buildConfirmPanel() {
        const panelNode = new Node('ConfirmPanel');
        panelNode.parent = this.node;
        panelNode.layer = Layers.Enum.UI_2D;

        this.confirmPanel = panelNode.addComponent(ConfirmPanel);
        this.confirmPanel.build();
    }

    // ================= 拖动地图 =================

    private setupDrag() {
        input.on(Input.EventType.TOUCH_START, this.onDragStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onDragMove, this);
        input.on(Input.EventType.TOUCH_END, this.onDragEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onDragEnd, this);
    }

    private onDragStart(e: EventTouch) {
        const p = e.getUILocation();
        this.setTouch(e.getID(), p.x, p.y);

        if (this.touches.length === 1) {
            this.beginDrag(p.x, p.y);
        } else {
            // 第二根手指按下了 —— 切换成捏合缩放
            this.pinchDist = this.pinchDistance();
        }
    }

    private onDragEnd(e: EventTouch) {
        this.removeTouch(e.getID());
        this.pinchDist = 0;
        // 松开后还剩一根手指的话，重新以它为起点继续拖
        if (this.touches.length === 1) {
            this.beginDrag(this.touches[0].x, this.touches[0].y);
        }
    }

    private beginDrag(px: number, py: number) {
        this.dragging = false;
        this.dragStartX = px;
        this.dragStartY = py;
        this.worldStartX = this.world.position.x;
        this.worldStartY = this.world.position.y;
    }

    private onDragMove(e: EventTouch) {
        // 有弹窗开着的时候不许拖地图
        if (this.marketPanel.node.active || this.orderPanel.node.active
            || this.confirmPanel.node.active || this.pastureScene.node.active) {
            return;
        }

        const p = e.getUILocation();
        this.setTouch(e.getID(), p.x, p.y);

        // ---- 两根手指：捏合缩放 ----
        if (this.touches.length >= 2) {
            const d = this.pinchDistance();
            if (this.pinchDist > 0 && d > 0) {
                this.applyZoom(this.zoom * (d / this.pinchDist));
            }
            this.pinchDist = d;
            this.dragging = true;
            InputGuard.markDragging();
            return;
        }

        // 保险：万一手势开始的事件没收到，就用这一次移动当起点
        if (this.dragStartX < -10000) {
            this.beginDrag(p.x, p.y);
            return;
        }

        const dx = p.x - this.dragStartX;
        const dy = p.y - this.dragStartY;

        // 手指要移动够远才算"拖动"，否则算点击
        if (!this.dragging) {
            if (Math.abs(dx) + Math.abs(dy) < 18) {
                return;
            }
            this.dragging = true;
        }

        // 拖动中 —— 这段时间里的点击全部忽略
        InputGuard.markDragging();

        this.world.setPosition(this.worldStartX + dx, this.worldStartY + dy, 0);
        this.clampWorld();
    }

    /** 以屏幕中心为锚点缩放 —— 这样捏合的时候画面不会"跑" */
    private applyZoom(z: number) {
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
        if (next === this.zoom) {
            return;
        }

        const ratio = next / this.zoom;
        this.zoom = next;
        this.world.setScale(next, next, 1);
        this.world.setPosition(this.world.position.x * ratio, this.world.position.y * ratio, 0);
        this.clampWorld();
    }

    /** 不许拖出地图边界（缩放之后边界会变，所以每次都要重算） */
    private clampWorld() {
        const maxX = Math.max(0, (MAP_W * this.zoom - this.canvasWidth) / 2);
        const maxY = Math.max(0, (MAP_H * this.zoom - this.canvasHeight) / 2);
        const p = this.world.position;
        this.world.setPosition(
            Math.min(maxX, Math.max(-maxX, p.x)),
            Math.min(maxY, Math.max(-maxY, p.y)),
            0
        );
    }

    private setTouch(id: number, x: number, y: number) {
        for (let i = 0; i < this.touches.length; i++) {
            if (this.touches[i].id === id) {
                this.touches[i].x = x;
                this.touches[i].y = y;
                return;
            }
        }
        this.touches.push({ id: id, x: x, y: y });
    }

    private removeTouch(id: number) {
        for (let i = 0; i < this.touches.length; i++) {
            if (this.touches[i].id === id) {
                this.touches.splice(i, 1);
                return;
            }
        }
    }

    /** 两根手指之间的距离 */
    private pinchDistance(): number {
        if (this.touches.length < 2) {
            return 0;
        }
        const dx = this.touches[0].x - this.touches[1].x;
        const dy = this.touches[0].y - this.touches[1].y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /** 提示条：放在田地和种子栏之间的空档，不拦点击 */
    private buildToast() {
        const w = 580;
        const h = 84;

        const node = new Node('Toast');
        node.parent = this.node;
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform).setContentSize(w, h);
        node.setPosition(0, -320, 0);

        const bg = new Node('Bg');
        bg.parent = node;
        bg.layer = Layers.Enum.UI_2D;
        const g = bg.addComponent(Graphics);
        g.fillColor = new Color(38, 30, 22, 225);
        g.roundRect(-w / 2, -h / 2, w, h, 18);
        g.fill();

        const textNode = new Node('Text');
        textNode.parent = node;
        textNode.layer = Layers.Enum.UI_2D;
        textNode.addComponent(UITransform).setContentSize(w - 40, h);
        this.toastLabel = textNode.addComponent(Label);
        this.toastLabel.fontFamily = 'Microsoft YaHei';
        this.toastLabel.fontSize = 38;
        this.toastLabel.lineHeight = 46;
        this.toastLabel.color = new Color(255, 238, 205, 255);
        this.toastLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this.toastLabel.verticalAlign = Label.VerticalAlign.CENTER;

        node.active = false;
        this.toastRoot = node;
    }

    // ================= 核心循环 =================

    private handlePlotClick(plot: Plot) {
        // 刚才是在拖地图，不是点地块
        if (InputGuard.blocked()) {
            return;
        }

        const crop: CropData = this.selected;

        // 锁着的地 → 先问玩家要不要开垦（开垦要花钱，不能误触）
        if (plot.isLocked()) {
            const cost = plot.getUnlockCost();
            if (this.coins < cost) {
                this.toast(`开垦这块地要 ${cost} 金币`);
                return;
            }
            this.confirmPanel.show('开垦这块地？', `花费 ${cost} 金币，开垦后就能种东西了`, '开垦', () => {
                this.unlockPlot(plot, cost);
            });
            return;
        }

        // 空地 → 种下去
        if (plot.isEmpty()) {
            if (this.coins < crop.seedCost) {
                this.toast(`金币不够，需要 ${crop.seedCost} 金币`);
                return;
            }
            this.coins -= crop.seedCost;
            plot.plant(crop);
            this.refreshHUD();
            this.save();
            return;
        }

        // 熟了 → 收获
        if (plot.isRipe()) {
            const harvested = plot.getCrop();
            if (!harvested) {
                return;
            }
            plot.clear();
            // 收进仓库，不再直接给钱 —— 卖菜是另一步
            this.inventory[harvested.id] = (this.inventory[harvested.id] || 0) + 1;
            this.refreshHUD();
            this.save();
            return;
        }

        // 生长中 → 问玩家要不要拔掉，换成别的作物
        if (plot.getCrop()) {
            this.askRemoveCrop(plot);
        }
    }

    /** 点了生长中的作物：弹窗问要不要拔掉 */
    private askRemoveCrop(plot: Plot) {
        const crop = plot.getCrop();
        if (!crop) {
            return;
        }

        // 刚种下（手滑）→ 全额退；已经长了一会儿 → 退一半
        const free = plot.getElapsed() < FREE_REMOVE_SECONDS;
        const refund = free ? crop.seedCost : Math.round(crop.seedCost * 0.5);

        const message = free
            ? `刚种下没多久，全额退回 ${refund} 金币`
            : `会退回 ${refund} 金币（种子钱的一半）`;

        this.confirmPanel.show(`拔掉这株${crop.name}？`, message, '拔掉', () => {
            this.removeCrop(plot, refund);
        });
    }

    /** 确认开垦：再检查一次金币（弹窗期间理论上不会变，但养成习惯） */
    private unlockPlot(plot: Plot, cost: number) {
        if (this.coins < cost) {
            this.toast(`金币不够，需要 ${cost} 金币`);
            return;
        }
        this.coins -= cost;
        plot.unlock();
        this.refreshHUD();
        this.save();
        this.toast(`开垦成功，花了 ${cost} 金币`);
    }

    private removeCrop(plot: Plot, refund: number) {
        plot.clear();
        this.coins += refund;
        this.refreshHUD();
        this.save();
        this.toast(`已退回 ${refund} 金币`);
    }

    private refreshHUD() {
        let stock = 0;
        for (const id in this.inventory) {
            stock += this.inventory[id] || 0;
        }
        this.coinLabel.string = `金币 ${this.coins}   仓库 ${stock}`;

        // 订单按钮上显示"有几单现在就能交"
        let ready = 0;
        for (let i = 0; i < this.orders.length; i++) {
            if (this.canDeliver(this.orders[i])) {
                ready++;
            }
        }
        if (this.orderButtonLabel) {
            this.orderButtonLabel.string = ready > 0 ? `订单 (${ready})` : '订单';
        }

        // 种子栏按金币重算"买得起 / 买不起"
        if (this.seedBar) {
            this.seedBar.setCoins(this.coins);
        }
    }

    // ================= 订单 =================

    /** 保证牌子上一直挂着 3 单 */
    private ensureOrders() {
        while (this.orders.length < 3) {
            this.orders.push(this.makeOrder());
        }
        this.orderPanel.refresh(this.orders, this.inventory);
    }

    private makeOrder(): OrderData {
        // 先用前三种作物，保证新手也交得起
        const pool = CROPS.slice(0, 3);
        const i1 = Math.floor(Math.random() * pool.length);
        const items: OrderItem[] = [
            { cropId: pool[i1].id, count: 2 + Math.floor(Math.random() * 3) },
        ];

        // 一半概率再加一种
        if (Math.random() < 0.5) {
            let i2 = Math.floor(Math.random() * pool.length);
            if (i2 === i1) {
                i2 = (i2 + 1) % pool.length;
            }
            items.push({ cropId: pool[i2].id, count: 1 + Math.floor(Math.random() * 2) });
        }

        let base = 0;
        for (let i = 0; i < items.length; i++) {
            const crop = findCrop(items[i].cropId);
            if (crop) {
                base += crop.sellPrice * items[i].count;
            }
        }

        return {
            id: this.nextOrderId++,
            items: items,
            // 比市场价高 50% —— 这就是订单的吸引力
            reward: Math.round(base * 1.5),
        };
    }

    /** 仓库里的货够不够交这单 */
    private canDeliver(order: OrderData): boolean {
        for (let i = 0; i < order.items.length; i++) {
            const item = order.items[i];
            if ((this.inventory[item.cropId] || 0) < item.count) {
                return false;
            }
        }
        return true;
    }

    private deliverOrder(orderId: number) {
        let target: OrderData | null = null;
        let index = -1;
        for (let i = 0; i < this.orders.length; i++) {
            if (this.orders[i].id === orderId) {
                target = this.orders[i];
                index = i;
                break;
            }
        }
        if (!target) {
            return;
        }
        if (!this.canDeliver(target)) {
            this.toast('仓库里的东西还不够');
            return;
        }

        // 从仓库扣货，发钱，然后补一张新订单
        for (let i = 0; i < target.items.length; i++) {
            const item = target.items[i];
            this.inventory[item.cropId] = (this.inventory[item.cropId] || 0) - item.count;
        }
        this.coins += target.reward;
        this.orders[index] = this.makeOrder();

        this.refreshHUD();
        this.orderPanel.refresh(this.orders, this.inventory);
        this.save();
    }

    /** 卖掉仓库里某种东西的全部（作物或动物产物都行） */
    private sellCrop(itemId: string) {
        const count = this.inventory[itemId] || 0;
        const item = findItem(itemId);
        if (count <= 0 || !item) {
            return;
        }
        this.coins += count * item.sellPrice;
        this.inventory[itemId] = 0;

        this.refreshHUD();
        this.marketPanel.refresh(this.inventory);
        this.save();
    }

    /** 一键卖光 */
    private sellAll() {
        const ids = allItemIds();
        for (let i = 0; i < ids.length; i++) {
            const item = findItem(ids[i]);
            if (!item) {
                continue;
            }
            const count = this.inventory[item.id] || 0;
            if (count > 0) {
                this.coins += count * item.sellPrice;
                this.inventory[item.id] = 0;
            }
        }
        this.refreshHUD();
        this.marketPanel.refresh(this.inventory);
        this.save();
    }

    private toast(msg: string) {
        if (!this.toastRoot) {
            return;   // 界面还没搭完，忽略
        }
        this.unscheduleAllCallbacks();
        this.toastLabel.string = msg;
        this.toastRoot.active = true;
        this.scheduleOnce(() => {
            this.toastRoot.active = false;
        }, 1.2);
    }

    // ================= 存档 =================

    private save() {
        const data = {
            coins: this.coins,
            inventory: this.inventory,
            orders: this.orders,
            nextOrderId: this.nextOrderId,
            pens: this.pens,
            // penLayout 2 = 现在的"每栏上限"结构（1 及更早是"逐个开垦"）
            penLayout: 2,
            penCap: this.penCap,
            plots: this.plots.map((p) => {
                const c = p.getCrop();
                return {
                    unlocked: !p.isLocked(),
                    id: c ? c.id : '',
                    at: c ? p.getPlantedAt() : 0,
                };
            }),
        };
        sys.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    }

    private loadSave() {
        const raw = sys.localStorage.getItem(SAVE_KEY);
        if (!raw) {
            this.coins = START_COINS;
            return;
        }
        try {
            const data = JSON.parse(raw);
            this.coins = typeof data.coins === 'number' ? data.coins : START_COINS;
            this.inventory = data.inventory || {};
            this.orders = data.orders || [];
            if (data.penLayout === 2) {
                this.pens = data.pens || [];
                this.penCap = Array.isArray(data.penCap) ? data.penCap : [];
            } else {
                // 老存档：把"鸡3羊3牛3、逐个开垦"搬成现在的"每栏上限"
                this.pens = this.migrateOldPens(data.pens || []);
                this.penCap = this.migrateOldCaps(data);
            }
            this.nextOrderId = typeof data.nextOrderId === 'number' ? data.nextOrderId : 1;
            for (let i = 0; i < this.orders.length; i++) {
                if (this.orders[i].id >= this.nextOrderId) {
                    this.nextOrderId = this.orders[i].id + 1;
                }
            }
            this.savedPlots = data.plots || [];
        } catch (e) {
            this.coins = START_COINS;
            this.inventory = {};
            this.orders = [];
            this.savedPlots = [];
        }
    }

    /**
     * 老存档的栏位（那时是"鸡3羊3牛3、两排、逐个开垦"）搬到现在的下标。
     * 能搬的动物尽量都保住，搬不了的（种类对不上）才丢掉。
     */
    private migrateOldPens(old: any[]): any[] {
        const out: any[] = [];
        for (let i = 0; i < PEN_COUNT; i++) {
            out.push({});
        }
        for (let i = 0; i < old.length && i < 18; i++) {
            const src = old[i];
            if (!src || !src.animalId) {
                continue;
            }
            const to = oldPenToNew(i);
            if (src.animalId !== penAnimalId(to)) {
                continue;
            }
            out[to] = src;
        }
        return out;
    }

    /** 老存档的"已经开了几个位置"换算成"每个围栏能养几只" */
    private migrateOldCaps(data: any): number[] {
        const counts = [0, 0, 0];
        const unlocked = data ? data.penUnlocked : null;
        const oldCount = data && typeof data.unlockedPens === 'number' ? data.unlockedPens : -1;

        for (let i = 0; i < 18; i++) {
            let open = false;
            if (Array.isArray(unlocked)) {
                open = unlocked[i] === true;
            } else if (oldCount >= 0) {
                open = i < oldCount;
            } else {
                open = i === 0;
            }
            if (open) {
                counts[oldPenFence(i)]++;
            }
        }

        const caps: number[] = [];
        for (let f = 0; f < PEN_FENCES.length; f++) {
            caps.push(clampInt(counts[f], PEN_CAP_START, PEN_CAP_MAX));
        }
        return caps;
    }
}
