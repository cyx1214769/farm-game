import { _decorator, Component, Node, Label, Graphics, Color, UITransform, Layers, EventTouch } from 'cc';
import { findAnimal, AnimalData, PEN_FENCES } from './AnimalConfig';
import { clearChildren } from './NodeUtil';

const { ccclass } = _decorator;

// ---------------- 布局 ----------------
const FENCE_W = 620;            // 一个围栏的宽
const FENCE_H = 300;            // 一个围栏的高（顶上要留一排按钮的位置）
const FENCE_GAP = 14;           // 围栏之间的间距
/** 栏杆上那排按钮，离围栏上沿多高 */
const HEADER_Y = FENCE_H / 2 - 26;
/** 动物之间的横向间距（按这一栏几只自动算） */
const MIN_STEP = 110;
const MAX_STEP = 190;
/** 状态牌浮在动物头顶多高 */
const STATUS_Y = 42;
/** 饿了 / 能收了的时候，头顶那个牌轻轻跳 */
const ALERT_PULSE = 0.09;
/** 幼崽画多大 */
const YOUNG_SCALE = 0.62;

// 动物走动的范围（和上次调好的参数一致）
const ROAM_X = 240;
const ROAM_Y_LIMIT = 108;
const ROAM_HOME_BIAS = 0.35;

const COLOR_GRASS   = new Color(140, 196, 118, 255);
const COLOR_FIELD   = new Color(126, 182, 106, 255);
const COLOR_FENCE   = new Color(198, 162, 118, 255);
const COLOR_DIVIDER = new Color(158, 200, 132, 160);
const COLOR_BTN     = new Color(96, 74, 52, 255);
const COLOR_BROWN   = new Color(120, 96, 70, 255);
const COLOR_GOLD    = new Color(226, 176, 74, 255);
const COLOR_RED     = new Color(224, 92, 72, 255);
const COLOR_DIM     = new Color(126, 120, 106, 255);
const COLOR_TEXT    = new Color(255, 246, 228, 255);
const COLOR_DARK    = new Color(74, 56, 34, 255);
const COLOR_GROW    = new Color(155, 224, 122, 255);
const COLOR_BAR     = new Color(20, 26, 16, 115);

function clamp(v: number, lo: number, hi: number): number {
    return v < lo ? lo : (v > hi ? hi : v);
}

function goldText(n: number): string {
    if (n < 10000) {
        return `${n} 金`;
    }
    const wan = n / 10000;
    const s = wan >= 100 ? `${Math.round(wan)}` : `${Math.round(wan * 10) / 10}`;
    return `${s} 万金`;
}

/** 一只动物给人看的数据 */
export interface PenView {
    /** 全局栏位下标：喂食 / 收获 / 卖掉都用它 */
    index: number;
    /** 还是幼崽 */
    young: boolean;
    /** 幼崽成长进度 0~1 */
    growProgress: number;
    /** 攒了几个产物（0 = 没有） */
    stored: number;
    /** 还能产几个（0 = 饿了） */
    fullness: number;
}

/** 一个围栏顶上那排要显示的东西 */
export interface PenFenceView {
    animalId: string;
    /** 这一栏现在能养几只 */
    cap: number;
    /** 已经养了几只 */
    count: number;
    /** 扩建价 */
    expandPrice: number;
    /** 还能扩建吗 */
    canExpand: boolean;
    /** 栏里的动物（按顺序排） */
    animals: PenView[];
}

/**
 * 牧场内部。
 *
 * 三个围栏：鸡栏、羊栏、牛栏。围栏里不画格子 —— 几只动物就站几只，
 * 各自在栏里溜达。栏杆上那排放「+ 扩建」和「买鸡 (2/3)」。
 */
@ccclass('PastureScene')
export class PastureScene extends Component {
    /** 买了动物（参数 = 第几个围栏） */
    public onBuyAnimal: ((fenceIndex: number) => void) | null = null;
    /** 扩建围栏（参数 = 第几个围栏） */
    public onExpand: ((fenceIndex: number) => void) | null = null;
    /** 点了动物头顶的状态牌：有产物就收，饿了就喂 */
    public onPenTap: ((penIndex: number) => void) | null = null;
    /** 点了动物本身：打开它的小面板 */
    public onAnimalTap: ((penIndex: number) => void) | null = null;
    public onFeedAll: (() => void) | null = null;
    public onCollectAll: (() => void) | null = null;
    public onClose: (() => void) | null = null;

    private fenceRoot: Node = null!;
    private coinLabel: Label = null!;
    /**
     * 会走动的动物。
     * node = 走动的容器（动物本体 + 头顶的状态牌都挂在它下面）
     * body = 动物本体自己（只有它左右翻转，不然头顶的字会变成镜像）
     */
    private walkers: { node: Node; body: Node; homeX: number; seed: number }[] = [];
    /** 需要跳动的状态牌（饿了 / 能收了） */
    private alerts: { node: Node; phase: number }[] = [];
    private time = 0;

    // ================= 搭建 =================

    public build(canvasWidth: number, canvasHeight: number, topInset: number) {
        const bg = new Node('Bg');
        bg.parent = this.node;
        bg.layer = Layers.Enum.UI_2D;
        const bgG = bg.addComponent(Graphics);
        bgG.fillColor = COLOR_GRASS;
        bgG.rect(-canvasWidth / 2, -canvasHeight / 2, canvasWidth, canvasHeight);
        bgG.fill();

        // 顶部：金币 + 仓库（牧场上到处要花钱，得看得见）
        const topY = canvasHeight / 2 - topInset - 26;
        const barNode = new Node('CoinBar');
        barNode.parent = this.node;
        barNode.layer = Layers.Enum.UI_2D;
        const barG = barNode.addComponent(Graphics);
        barG.fillColor = new Color(38, 30, 22, 215);
        barG.roundRect(-340, topY - 27, 300, 54, 27);
        barG.fill();
        this.coinLabel = this.makeLabel(this.node, '', -190, topY, 300, 54, 21, COLOR_TEXT);

        this.fenceRoot = new Node('Fences');
        this.fenceRoot.parent = this.node;
        this.fenceRoot.layer = Layers.Enum.UI_2D;

        const bottomY = -canvasHeight / 2 + 80;
        this.makeButton(this.node, '一键喂食', -190, bottomY, 180, 76, COLOR_BTN, COLOR_TEXT, () => {
            if (this.onFeedAll) { this.onFeedAll(); }
        });
        this.makeButton(this.node, '一键收获', 0, bottomY, 180, 76, COLOR_GOLD, COLOR_DARK, () => {
            if (this.onCollectAll) { this.onCollectAll(); }
        });
        this.makeButton(this.node, '返回', 190, bottomY, 180, 76, COLOR_BTN, COLOR_TEXT, () => {
            if (this.onClose) { this.onClose(); }
        });

        this.node.active = false;
    }

    // ================= 对外 =================

    public setVisible(visible: boolean) {
        this.node.active = visible;
    }

    public refresh(fences: PenFenceView[], coins: number, stock: number) {
        this.coinLabel.string = `金币 ${coins}　仓库 ${stock}`;

        clearChildren(this.fenceRoot);
        this.walkers = [];
        this.alerts = [];

        const n = fences.length;
        const totalH = n * FENCE_H + (n - 1) * FENCE_GAP;
        const topY = totalH / 2 - FENCE_H / 2;

        for (let f = 0; f < n; f++) {
            this.buildFence(f, fences[f], topY - f * (FENCE_H + FENCE_GAP));
        }
    }

    update(dt: number) {
        this.time += dt;
        const t = this.time;

        // 走到哪只由时间算出来 —— 所以界面刷新的时候动物不会被"拽回原位"
        for (let i = 0; i < this.walkers.length; i++) {
            const w = this.walkers[i];
            const s = w.seed;

            const wx = Math.sin(t * 0.14 + s) * 115 + Math.sin(t * 0.33 + s * 1.7) * 55;
            const wy = Math.sin(t * 0.24 + s * 2.3) * 18 + Math.sin(t * 0.51 + s * 0.9) * 8;
            const vx = Math.cos(t * 0.14 + s) * 115 * 0.14 + Math.cos(t * 0.33 + s * 1.7) * 55 * 0.33;
            const face = vx >= 0 ? 1 : -1;

            // 别跑出围栏
            const gx = clamp(w.homeX * ROAM_HOME_BIAS + wx, -ROAM_X, ROAM_X);
            const gy = clamp(wy, -ROAM_Y_LIMIT, ROAM_Y_LIMIT);

            w.node.setPosition(gx - w.homeX, gy, 0);
            w.body.setScale(face, 1, 1);
        }

        // 饿了、有东西可以收的时候，头顶那个牌轻轻跳
        for (let i = 0; i < this.alerts.length; i++) {
            const a = this.alerts[i];
            const k = 1 + Math.sin(t * 3.6 + a.phase) * ALERT_PULSE;
            a.node.setScale(k, k, 1);
        }
    }

    // ================= 一个围栏 =================

    private buildFence(fenceIndex: number, fence: PenFenceView, fy: number) {
        const node = new Node('Fence');
        node.parent = this.fenceRoot;
        node.layer = Layers.Enum.UI_2D;
        node.setPosition(0, fy, 0);

        // 草地底板 + 木框
        const g = node.addComponent(Graphics);
        g.fillColor = COLOR_FIELD;
        g.roundRect(-FENCE_W / 2, -FENCE_H / 2, FENCE_W, FENCE_H, 24);
        g.fill();

        g.fillColor = COLOR_FENCE;
        g.rect(-FENCE_W / 2, -FENCE_H / 2, FENCE_W, 12);
        g.rect(-FENCE_W / 2, FENCE_H / 2 - 12, FENCE_W, 12);
        g.rect(-FENCE_W / 2, -FENCE_H / 2, 12, FENCE_H);
        g.rect(FENCE_W / 2 - 12, -FENCE_H / 2, 12, FENCE_H);
        for (let i = -2; i <= 2; i++) {
            const px = i * 140;
            g.rect(px - 7, FENCE_H / 2 - 26, 14, 40);
            g.rect(px - 7, -FENCE_H / 2 - 14, 14, 40);
        }
        g.fill();

        g.fillColor = COLOR_DIVIDER;
        g.rect(-FENCE_W / 2 + 16, HEADER_Y - 22, FENCE_W - 32, 4);
        g.fill();

        const animal = findAnimal(fence.animalId);
        const name = animal ? animal.name : '';

        // 栏杆那排：栏名 + 扩建 + 买动物（已养 / 上限）
        this.makeLabel(node, `${name}栏`, -FENCE_W / 2 + 70, HEADER_Y, 120, 34, 24, COLOR_TEXT);
        if (fence.canExpand) {
            const fi = fenceIndex;
            this.makeButton(node, '+ 扩建', -FENCE_W / 2 + 210, HEADER_Y, 120, 42, COLOR_GOLD, COLOR_DARK, () => {
                if (this.onExpand) { this.onExpand(fi); }
            });
        }

        const full = fence.count >= fence.cap;
        const fi2 = fenceIndex;
        this.makeButton(
            node,
            `买${name} (${fence.count}/${fence.cap})`,
            -FENCE_W / 2 + 210 + 168,
            HEADER_Y,
            176,
            42,
            full ? COLOR_DIM : COLOR_BTN,
            COLOR_TEXT,
            () => {
                if (this.onBuyAnimal) { this.onBuyAnimal(fi2); }
            }
        );

        // 动物：几只就站几只，均匀铺开
        const n = fence.animals.length;
        const step = n > 1 ? clamp(480 / (n - 1), MIN_STEP, MAX_STEP) : 0;
        for (let k = 0; k < n; k++) {
            const x = (k - (n - 1) / 2) * step;
            this.buildAnimal(node, fence.animals[k], animal, x, fenceIndex * 10 + k);
        }
    }

    private buildAnimal(fence: Node, view: PenView, animal: AnimalData | null, x: number, seed: number) {
        if (!animal) {
            return;
        }

        const roamer = new Node('Roamer');
        roamer.parent = fence;
        roamer.layer = Layers.Enum.UI_2D;
        roamer.setPosition(x, 0, 0);

        // 动物本体 —— 自己也是一个按钮（点它打开小面板）
        const body = new Node('Body');
        body.parent = roamer;
        body.layer = Layers.Enum.UI_2D;
        body.addComponent(UITransform).setContentSize(124, 96);
        body.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
            e.propagationStopped = true;
            if (this.onAnimalTap) { this.onAnimalTap(view.index); }
        }, this);

        const shape = new Node('Shape');
        shape.parent = body;
        shape.layer = Layers.Enum.UI_2D;
        if (view.young) {
            shape.setScale(YOUNG_SCALE, YOUNG_SCALE, 1);
        }
        const bg = shape.addComponent(Graphics);
        this.drawAnimal(bg, animal.id);

        this.walkers.push({ node: roamer, body: body, homeX: x, seed: seed });

        // 头顶的状态
        this.buildStatus(roamer, view, animal);
    }

    /**
     * 头顶那个牌子：
     *   幼崽   → 长大中 + 进度条（不能点）
     *   有产物 → 金色的"产物 ×数量"，点一下收
     *   饿了   → 红色感叹号，点一下喂
     *   成年待着 → 什么都不放
     */
    private buildStatus(parent: Node, view: PenView, animal: AnimalData) {
        if (view.young) {
            const node = new Node('Growing');
            node.parent = parent;
            node.layer = Layers.Enum.UI_2D;
            node.setPosition(0, STATUS_Y, 0);
            node.addComponent(UITransform).setContentSize(120, 54);

            const g = node.addComponent(Graphics);
            g.fillColor = COLOR_BAR;
            g.roundRect(-38, 0, 76, 16, 8);
            g.fill();
            const p = clamp(view.growProgress, 0, 1);
            if (p > 0.02) {
                g.fillColor = COLOR_GROW;
                g.roundRect(-38 + (76 * p) / 2, 2, 76 * p, 12, 6);
                g.fill();
            }

            this.makeLabel(node, '长大中', 0, 20, 110, 26, 18, COLOR_TEXT);
            return;
        }

        const hasProduct = view.stored > 0;
        const hungry = !hasProduct && view.fullness <= 0;
        if (!hasProduct && !hungry) {
            return;
        }

        const node = new Node('Status');
        node.parent = parent;
        node.layer = Layers.Enum.UI_2D;
        node.setPosition(0, STATUS_Y, 0);

        if (hasProduct) {
            const text = `${animal.productName} ×${view.stored}`;
            const w = Math.max(96, text.length * 18 + 30);
            node.addComponent(UITransform).setContentSize(w, 40);
            const g = node.addComponent(Graphics);
            g.fillColor = COLOR_GOLD;
            g.roundRect(-w / 2, -20, w, 40, 20);
            g.fill();
            this.makeLabel(node, text, 0, 0, w, 40, 23, COLOR_DARK);
        } else {
            node.addComponent(UITransform).setContentSize(56, 56);
            const g = node.addComponent(Graphics);
            g.fillColor = COLOR_RED;
            g.circle(0, 0, 26);
            g.fill();
            this.makeLabel(node, '!', 0, 2, 56, 56, 40, COLOR_TEXT);
        }

        this.alerts.push({ node: node, phase: view.index * 1.1 });

        node.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
            e.propagationStopped = true;
            if (this.onPenTap) { this.onPenTap(view.index); }
        }, this);
    }

    // ================= 占位动物 =================

    private drawAnimal(g: Graphics, animalId: string) {
        if (animalId === 'chicken') {
            g.fillColor = new Color(246, 243, 234, 255);
            g.ellipse(0, 0, 24, 20);
            g.fill();
            g.fillColor = new Color(255, 246, 228, 255);
            g.circle(16, 12, 11);
            g.fill();
            g.fillColor = COLOR_RED;
            g.circle(16, 23, 5);
            g.fill();
            g.fillColor = new Color(240, 190, 80, 255);
            g.moveTo(26, 12); g.lineTo(35, 15); g.lineTo(26, 18); g.close();
            g.fill();
        } else if (animalId === 'sheep') {
            g.fillColor = new Color(238, 231, 218, 255);
            g.ellipse(0, 0, 30, 22);
            g.fill();
            g.circle(-9, 13, 13);
            g.fill();
            g.circle(7, 15, 12);
            g.fill();
            g.fillColor = new Color(150, 132, 112, 255);
            g.circle(24, 9, 9);
            g.fill();
        } else {
            g.fillColor = new Color(201, 168, 130, 255);
            g.ellipse(0, 0, 32, 22);
            g.fill();
            g.fillColor = new Color(140, 110, 82, 255);
            g.ellipse(-9, 5, 9, 7);
            g.fill();
            g.ellipse(11, -6, 7, 5);
            g.fill();
            g.fillColor = new Color(232, 224, 210, 255);
            g.circle(26, 9, 11);
            g.fill();
            g.fillColor = new Color(120, 96, 72, 255);
            g.rect(22, 20, 4, 9);
            g.rect(32, 20, 4, 9);
            g.fill();
        }
    }

    // ================= 小工具 =================

    private makeLabel(parent: Node, text: string, x: number, y: number, w: number, h: number, size: number, color: Color): Label {
        const node = new Node('Label');
        node.parent = parent;
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform).setContentSize(w, h);
        node.setPosition(x, y, 0);

        const lb = node.addComponent(Label);
        lb.fontFamily = 'Microsoft YaHei';
        lb.fontSize = size;
        lb.lineHeight = size + 6;
        lb.color = color;
        lb.horizontalAlign = Label.HorizontalAlign.CENTER;
        lb.verticalAlign = Label.VerticalAlign.CENTER;
        lb.string = text;
        return lb;
    }

    private makeButton(parent: Node, text: string, x: number, y: number, w: number, h: number, bg: Color, fg: Color, onClick: () => void) {
        const node = new Node('Btn');
        node.parent = parent;
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform).setContentSize(w, h);
        node.setPosition(x, y, 0);

        const bgNode = new Node('Bg');
        bgNode.parent = node;
        bgNode.layer = Layers.Enum.UI_2D;
        bgNode.addComponent(UITransform).setContentSize(w, h);
        const g = bgNode.addComponent(Graphics);
        g.fillColor = bg;
        g.roundRect(-w / 2, -h / 2, w, h, 12);
        g.fill();

        this.makeLabel(node, text, 0, 0, w + 20, h, 22, fg);

        node.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
            e.propagationStopped = true;
            onClick();
        }, this);
    }
}
