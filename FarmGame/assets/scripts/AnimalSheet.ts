import { _decorator, Component, Node, Label, Graphics, Color, UITransform, Layers, EventTouch } from 'cc';

const { ccclass } = _decorator;

const PANEL_W = 560;
const PANEL_H = 470;

const COLOR_TEXT = new Color(255, 246, 228, 255);
const COLOR_HINT = new Color(216, 200, 174, 255);
const COLOR_GOLD = new Color(226, 176, 74, 255);
const COLOR_BROWN = new Color(120, 96, 70, 255);
const COLOR_DARK = new Color(74, 56, 34, 255);
const COLOR_DIM = new Color(126, 120, 106, 255);

/** 面板上要显示的东西 */
export interface AnimalSheetData {
    title: string;
    status: string;
    feedText: string;
    feedEnabled: boolean;
    collectText: string;
    collectEnabled: boolean;
    sellText: string;
    sellEnabled: boolean;
}

interface BtnRef {
    g: Graphics;
    lb: Label;
    w: number;
    h: number;
}

/**
 * 点动物弹出来的小面板：喂食 / 收获 / 卖掉换肉。
 *
 * 它自己不做任何事，只负责把状态显示出来、把点击转给主控 ——
 * "这只动物现在能不能卖"由主控说了算。
 */
@ccclass('AnimalSheet')
export class AnimalSheet extends Component {
    public onFeed: (() => void) | null = null;
    public onCollect: (() => void) | null = null;
    public onSell: (() => void) | null = null;
    public onClose: (() => void) | null = null;

    private titleLabel: Label = null!;
    private statusLabel: Label = null!;
    private feed: BtnRef = null!;
    private collect: BtnRef = null!;
    private sell: BtnRef = null!;
    private feedOn = false;
    private collectOn = false;
    private sellOn = false;

    // ================= 搭建 =================

    public build() {
        // 遮罩：点一下 = 关闭
        const mask = new Node('Mask');
        mask.parent = this.node;
        mask.layer = Layers.Enum.UI_2D;
        mask.addComponent(UITransform).setContentSize(2000, 3000);
        const mg = mask.addComponent(Graphics);
        mg.fillColor = new Color(0, 0, 0, 150);
        mg.rect(-1000, -1500, 2000, 3000);
        mg.fill();
        mask.on(Node.EventType.TOUCH_END, () => this.hide(), this);

        const panel = new Node('Panel');
        panel.parent = this.node;
        panel.layer = Layers.Enum.UI_2D;
        panel.addComponent(UITransform).setContentSize(PANEL_W, PANEL_H);
        const pg = panel.addComponent(Graphics);
        pg.fillColor = new Color(78, 60, 42, 255);
        pg.roundRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, 22);
        pg.fill();

        this.titleLabel = this.makeLabel(panel, '', 0, 170, PANEL_W - 60, 56, 36, COLOR_TEXT);
        this.statusLabel = this.makeLabel(panel, '', 0, 100, PANEL_W - 60, 46, 26, COLOR_HINT);

        this.feed = this.makeButton(panel, -130, 10, 220, 76, COLOR_BROWN, () => {
            if (this.feedOn && this.onFeed) { this.onFeed(); }
        });
        this.collect = this.makeButton(panel, 130, 10, 220, 76, COLOR_GOLD, () => {
            if (this.collectOn && this.onCollect) { this.onCollect(); }
        });
        this.sell = this.makeButton(panel, 0, -85, 460, 76, COLOR_BROWN, () => {
            if (this.sellOn && this.onSell) { this.onSell(); }
        });
        this.makeButton(panel, 0, -175, 240, 66, COLOR_BROWN, () => this.hide());

        this.node.active = false;
    }

    // ================= 对外 =================

    public show(data: AnimalSheetData) {
        this.titleLabel.string = data.title;
        this.statusLabel.string = data.status;

        this.feedOn = data.feedEnabled;
        this.collectOn = data.collectEnabled;
        this.sellOn = data.sellEnabled;

        this.paint(this.feed, data.feedText, data.feedEnabled, COLOR_BROWN);
        this.paint(this.collect, data.collectText, data.collectEnabled, COLOR_GOLD);
        this.paint(this.sell, data.sellText, data.sellEnabled, COLOR_BROWN);

        this.node.active = true;
    }

    public hide() {
        this.node.active = false;
    }

    // ================= 小工具 =================

    /** 重新画一个按钮：能点就是正常颜色，不能点就是灰的 */
    private paint(ref: BtnRef, text: string, enabled: boolean, color: Color) {
        ref.g.clear();
        ref.g.fillColor = enabled ? color : COLOR_DIM;
        ref.g.roundRect(-ref.w / 2, -ref.h / 2, ref.w, ref.h, 14);
        ref.g.fill();

        ref.lb.string = text;
        ref.lb.color = (enabled && color === COLOR_GOLD) ? COLOR_DARK : COLOR_TEXT;
    }

    private makeLabel(parent: Node, text: string, x: number, y: number, w: number, h: number, size: number, color: Color): Label {
        const node = new Node('Label');
        node.parent = parent;
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform).setContentSize(w, h);
        node.setPosition(x, y, 0);

        const lb = node.addComponent(Label);
        lb.fontFamily = 'Microsoft YaHei';
        lb.fontSize = size;
        lb.lineHeight = size + 8;
        lb.color = color;
        lb.horizontalAlign = Label.HorizontalAlign.CENTER;
        lb.verticalAlign = Label.VerticalAlign.CENTER;
        lb.string = text;
        return lb;
    }

    private makeButton(parent: Node, x: number, y: number, w: number, h: number, color: Color, onClick: () => void): BtnRef {
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
        g.fillColor = color;
        g.roundRect(-w / 2, -h / 2, w, h, 14);
        g.fill();

        const lb = this.makeLabel(node, '', 0, 0, w, h, 26, COLOR_TEXT);
        node.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
            e.propagationStopped = true;
            onClick();
        }, this);

        return { g: g, lb: lb, w: w, h: h };
    }
}
