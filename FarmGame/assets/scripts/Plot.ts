import { _decorator, Component, Node, Label, Graphics, Color, UITransform, Layers, EventTouch, Sprite, SpriteFrame } from 'cc';
import { CropData } from './CropConfig';
import { ISO_ART } from './ArtConfig';

const { ccclass } = _decorator;

/** 地块的四种状态 */
type PlotState = 'locked' | 'empty' | 'growing' | 'ripe';

function hex(str: string): Color {
    const c = new Color();
    Color.fromHEX(c, str);
    return c;
}

/**
 * 一块地。
 * 它只负责三件事：画自己、管自己的生长计时、被点的时候喊一声。
 * 「种什么」「花多少钱」「收多少」这些规则不在这里，在 FarmGame 里。
 */
@ccclass('Plot')
export class Plot extends Component {
    /** 玩家点了这块地时触发 */
    public onClicked: ((plot: Plot) => void) | null = null;

    /**
     * 手指在这块地上按下 / 移动 / 抬起。
     * 转发给主控，用来实现"在地块上也能拖动地图" —— 不然地块会把触摸吃掉。
     */
    public onPressStart: ((e: EventTouch) => void) | null = null;
    public onPressMove: ((e: EventTouch) => void) | null = null;
    public onPressEnd: ((e: EventTouch) => void) | null = null;

    private soilG: Graphics = null!;
    private cropG: Graphics = null!;
    private ringG: Graphics = null!;
    private lockLabel: Label = null!;
    /** 有贴图的时候用这两个显示（和上面的 Graphics 二选一） */
    private soilSprite: Sprite = null!;
    private cropSprite: Sprite = null!;
    /** 贴图放在单独的子节点上 —— 一个节点上只挂一个渲染组件最稳 */
    private soilArtNode: Node = null!;
    private cropArtNode: Node = null!;
    private soilFrame: SpriteFrame | null = null;
    private artFrames: Record<string, SpriteFrame> = {};

    private size = 150;
    private state: PlotState = 'empty';
    private crop: CropData | null = null;
    private elapsed = 0;
    private lastStep = -1;
    private unlockCost = 0;

    // ================= 初始化 =================

    public init(size: number) {
        this.size = size;

        const t = this.node.getComponent(UITransform) || this.node.addComponent(UITransform);
        // 点击范围先用菱形的外接矩形（0.96 稍微收一点，减少相邻地块抢点击）
        t.setContentSize(size * 0.92, size * 0.46);

        // 泥土、作物、成熟光环各自用一个 Graphics，
        // 这样一个图形重画时不会把别的图形也擦掉。
        const soil = new Node('Soil');
        soil.parent = this.node;
        soil.layer = Layers.Enum.UI_2D;
        this.soilG = soil.addComponent(Graphics);

        // 贴图单独一个子节点，和上面那层 Graphics 分开
        this.soilArtNode = new Node('SoilArt');
        this.soilArtNode.parent = soil;
        this.soilArtNode.layer = Layers.Enum.UI_2D;
        this.soilArtNode.addComponent(UITransform);
        this.soilSprite = this.soilArtNode.addComponent(Sprite);
        this.soilArtNode.active = false;

        const crop = new Node('Crop');
        crop.parent = this.node;
        crop.layer = Layers.Enum.UI_2D;
        this.cropG = crop.addComponent(Graphics);

        this.cropArtNode = new Node('CropArt');
        this.cropArtNode.parent = crop;
        this.cropArtNode.layer = Layers.Enum.UI_2D;
        this.cropArtNode.addComponent(UITransform);
        this.cropSprite = this.cropArtNode.addComponent(Sprite);
        this.cropArtNode.active = false;

        const ring = new Node('Ring');
        ring.parent = this.node;
        ring.layer = Layers.Enum.UI_2D;
        this.ringG = ring.addComponent(Graphics);

        // 锁住时显示的价钱
        const lock = new Node('Lock');
        lock.parent = this.node;
        lock.layer = Layers.Enum.UI_2D;
        const lt = lock.addComponent(UITransform);
        lt.setContentSize(size * 0.94, size * 0.34);
        this.lockLabel = lock.addComponent(Label);
        this.lockLabel.fontFamily = 'Microsoft YaHei';
        this.lockLabel.fontSize = Math.round(size * 0.14);
        this.lockLabel.lineHeight = this.lockLabel.fontSize + 6;
        this.lockLabel.color = new Color(255, 236, 205, 255);
        this.lockLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this.lockLabel.verticalAlign = Label.VerticalAlign.CENTER;
        lock.active = false;

        this.node.on(Node.EventType.TOUCH_START, this.handlePressStart, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this.handlePressMove, this);
        this.node.on(Node.EventType.TOUCH_END, this.handlePressEnd, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.handlePressEnd, this);

        this.draw();
    }

    // ================= 对外接口 =================

    public isEmpty(): boolean { return this.state === 'empty'; }
    public isRipe(): boolean { return this.state === 'ripe'; }
    public isLocked(): boolean { return this.state === 'locked'; }
    public getCrop(): CropData | null { return this.crop; }
    public getElapsed(): number { return this.elapsed; }
    public getUnlockCost(): number { return this.unlockCost; }

    /**
     * 换成真贴图。
     * soil = 泥土格那张图；frames = 所有作物贴图（按名字查）。
     * 传 null 或者查不到，就继续画色块 —— 所以没图也不会崩。
     */
    public setArt(soil: SpriteFrame | null, frames: Record<string, SpriteFrame>) {
        this.soilFrame = soil;
        this.artFrames = frames || {};
        this.draw();
    }

    /**
     * 这种作物现在该用哪张形态图、放多大。
     * 取不到就返回 null（继续画色块）。
     */
    private cropArt(): { frame: SpriteFrame; scale: number } | null {
        const art = this.crop ? this.crop.art : null;
        if (!this.crop || !art || art.length === 0) {
            return null;
        }

        const ratio = this.state === 'ripe'
            ? 1
            : Math.min(1, this.elapsed / this.crop.growSeconds);

        // 找最后一个"已经到点"的形态
        let idx = 0;
        for (let i = 0; i < art.length; i++) {
            if (ratio >= art[i].at) {
                idx = i;
            }
        }

        const frame = this.artFrames[art[idx].name];
        if (!frame) {
            return null;
        }

        // 在这一个形态之内再慢慢长大一点，这样换图的瞬间不会太突兀
        const start = art[idx].at;
        const end = idx + 1 < art.length ? art[idx + 1].at : 1;
        const local = end > start ? (ratio - start) / (end - start) : 1;
        const scale = 0.88 + 0.14 * Math.max(0, Math.min(1, local));

        return { frame: frame, scale: scale };
    }

    /** 把一张贴图对齐到地块中心：菱形中心 = 地块原点 */
    private placeSprite(sprite: Sprite, frame: SpriteFrame, sizeMul: number) {
        const s = (this.size / ISO_ART.diamondPx) * sizeMul;

        // 顺序很重要：
        // 先设成 CUSTOM 再赋贴图 —— 否则 Cocos 在赋贴图时会把尺寸重置成图片原始大小
        // （那样第一次显示的格子会突然变大），尺寸最后再设一遍最保险。
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.trim = false;
        sprite.spriteFrame = frame;

        const t = sprite.node.getComponent(UITransform);
        if (t) {
            t.setContentSize(ISO_ART.canvasW * s, ISO_ART.canvasH * s);
        }

        const dx = (ISO_ART.canvasW / 2 - ISO_ART.diamondCx) * s;
        const dy = (ISO_ART.diamondCy - ISO_ART.canvasH / 2) * s;
        sprite.node.setPosition(dx, dy, 0);
    }

    /** 设为锁定状态（并记下开垦要多少钱） */
    public setLocked(locked: boolean, cost: number) {
        this.unlockCost = cost;
        this.lockLabel.string = locked ? `${cost} 金` : '';
        this.lockLabel.node.active = locked;

        if (locked) {
            this.state = 'locked';
            this.crop = null;
            this.elapsed = 0;
        } else {
            this.state = 'empty';
        }
        this.draw();
    }

    /** 开垦出来 */
    public unlock() {
        this.state = 'empty';
        this.lockLabel.node.active = false;
        this.draw();
    }

    /** 什么时候种下的（用于存档 + 离线生长） */
    public getPlantedAt(): number {
        return Date.now() - this.elapsed * 1000;
    }

    public plant(crop: CropData) {
        this.crop = crop;
        this.state = 'growing';
        this.elapsed = 0;
        this.lastStep = -1;
        this.draw();
    }

    /** 存档载入时用：直接恢复到某个生长进度（离线也在长） */
    public restore(crop: CropData, elapsedSeconds: number) {
        this.crop = crop;
        this.elapsed = Math.min(elapsedSeconds, crop.growSeconds);
        this.state = this.elapsed >= crop.growSeconds ? 'ripe' : 'growing';
        this.lastStep = -1;
        this.draw();
    }

    public clear() {
        this.crop = null;
        this.state = 'empty';
        this.elapsed = 0;
        this.lastStep = -1;
        this.draw();
    }

    // ================= 生命周期 =================

    update(dt: number) {
        if (this.state !== 'growing' || !this.crop) {
            return;
        }

        this.elapsed += dt;

        if (this.elapsed >= this.crop.growSeconds) {
            this.elapsed = this.crop.growSeconds;
            this.state = 'ripe';
            this.drawCrop();
            return;
        }

        // 只在长势跨过 1/10 时重画一次，省性能
        const step = Math.floor((this.elapsed / this.crop.growSeconds) * 10);
        if (step !== this.lastStep) {
            this.lastStep = step;
            this.drawCrop();
        }
    }

    private handlePressStart(e: EventTouch) {
        if (this.onPressStart) {
            this.onPressStart(e);
        }
    }

    private handlePressMove(e: EventTouch) {
        if (this.onPressMove) {
            this.onPressMove(e);
        }
    }

    private handlePressEnd(e: EventTouch) {
        // 先让主控清理触摸状态，再判断"这算不算点击"
        if (this.onPressEnd) {
            this.onPressEnd(e);
        }
        if (this.onClicked) {
            this.onClicked(this);
        }
    }

    // ================= 绘制 =================

    private draw() {
        this.drawSoil();
        this.drawCrop();
    }

    private drawSoil() {
        const w = this.size;
        const h = this.size * 0.5; // 2:1 菱形 ≈ 30° 俯角

        const g = this.soilG;
        const locked = this.state === 'locked';

        // 有贴图、又不是"锁住"的格子 → 用贴图
        // （锁住的格子继续画灰色，玩家一眼能看出哪些还没开垦）
        if (!locked && this.soilFrame && this.soilSprite) {
            g.clear();
            g.enabled = false;
            this.soilArtNode.active = true;
            this.placeSprite(this.soilSprite, this.soilFrame, 1);
            return;
        }

        this.soilArtNode.active = false;
        g.enabled = true;
        g.clear();

        g.fillColor = locked
            ? new Color(104, 100, 88, 255)   // 锁住：灰的
            : new Color(150, 111, 74, 255);  // 正常：泥土地

        g.moveTo(0, h / 2);
        g.lineTo(w / 2, 0);
        g.lineTo(0, -h / 2);
        g.lineTo(-w / 2, 0);
        g.close();
        g.fill();

        // 细描边 —— 不加的话格子边界看不出来，数不清有几块
        g.strokeColor = locked
            ? new Color(66, 62, 54, 255)
            : new Color(112, 82, 52, 255);
        g.lineWidth = 2;
        g.moveTo(0, h / 2);
        g.lineTo(w / 2, 0);
        g.lineTo(0, -h / 2);
        g.lineTo(-w / 2, 0);
        g.close();
        g.stroke();
    }

    private drawCrop() {
        const w = this.size;
        const h = this.size * 0.5;
        const g = this.cropG;
        const ring = this.ringG;

        g.clear();
        ring.clear();

        if (!this.crop) {
            this.cropArtNode.active = false;
            return;
        }

        const ratio = this.state === 'ripe'
            ? 1
            : Math.min(1, this.elapsed / this.crop.growSeconds);

        // 有贴图 → 用图（按生长进度挑形态，形态内部再放大过渡）
        const art = this.cropArt();
        if (art && this.cropSprite) {
            g.enabled = false;
            this.cropArtNode.active = true;
            this.placeSprite(this.cropSprite, art.frame, art.scale);
            return;
        }

        this.cropArtNode.active = false;
        g.enabled = true;

        // 从一小颗长成一大颗 —— 用大小表示生长进度
        // 注意别画太大，不然会把地块整个盖住，看不出网格
        const rx = w * (0.07 + 0.10 * ratio);
        const ry = rx * 0.9;
        // 稍微往上抬一点，看起来像"长在地块上"而不是"躺在地块里"
        const cy = h * 0.22 + ry * 0.4;

        g.fillColor = this.state === 'ripe' ? hex(this.crop.ripeColor) : hex(this.crop.sproutColor);
        g.ellipse(0, cy, rx, ry);
        g.fill();

        // 成熟了套一圈金边，让玩家一眼看出"可以收了"
        if (this.state === 'ripe') {
            ring.strokeColor = new Color(255, 214, 82, 255);
            ring.lineWidth = 6;
            ring.ellipse(0, cy, rx + 6, ry + 6);
            ring.stroke();
        }
    }
}
