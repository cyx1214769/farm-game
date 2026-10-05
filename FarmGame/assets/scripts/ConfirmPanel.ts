import { _decorator, Component, Node, Label, Graphics, Color, UITransform, Layers } from 'cc';

const { ccclass } = _decorator;

const PANEL_W = 560;
const PANEL_H = 400;

const COLOR_TEXT = new Color(255, 246, 228, 255);
const COLOR_HINT = new Color(216, 200, 174, 255);

/**
 * 通用确认弹窗：一句标题 + 一句说明 + 一个「确定」和一个「取消」。
 * 点遮罩（面板外面）也等于取消。
 */
@ccclass('ConfirmPanel')
export class ConfirmPanel extends Component {
    private titleLabel: Label = null!;
    private msgLabel: Label = null!;
    private okLabel: Label = null!;
    private okHandler: (() => void) | null = null;

    // ================= 搭建 =================

    public build() {
        // 遮罩：点一下 = 取消
        const mask = new Node('Mask');
        mask.parent = this.node;
        mask.layer = Layers.Enum.UI_2D;
        mask.addComponent(UITransform).setContentSize(2000, 3000);
        const mg = mask.addComponent(Graphics);
        mg.fillColor = new Color(0, 0, 0, 150);
        mg.rect(-1000, -1500, 2000, 3000);
        mg.fill();
        mask.on(Node.EventType.TOUCH_END, () => this.hide(), this);

        // 面板
        const panel = new Node('Panel');
        panel.parent = this.node;
        panel.layer = Layers.Enum.UI_2D;
        panel.addComponent(UITransform).setContentSize(PANEL_W, PANEL_H);
        const pg = panel.addComponent(Graphics);
        pg.fillColor = new Color(78, 60, 42, 255);
        pg.roundRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, 22);
        pg.fill();

        this.titleLabel = this.makeLabel(panel, '', 0, PANEL_H / 2 - 76, PANEL_W - 60, 64, 36, COLOR_TEXT);
        this.msgLabel = this.makeLabel(panel, '', 0, 16, PANEL_W - 70, 96, 28, COLOR_HINT);

        this.okLabel = this.makeButton(panel, '确定', -132, -PANEL_H / 2 + 82, 220, 80,
            new Color(226, 176, 74, 255), () => {
                const fn = this.okHandler;
                this.hide();
                if (fn) {
                    fn();
                }
            });

        this.makeButton(panel, '取消', 132, -PANEL_H / 2 + 82, 220, 80,
            new Color(120, 96, 70, 255), () => this.hide());

        this.node.active = false;
    }

    // ================= 对外接口 =================

    public show(title: string, message: string, okText: string, onOk: () => void) {
        this.titleLabel.string = title;
        this.msgLabel.string = message;
        this.okLabel.string = okText;
        this.okHandler = onOk;
        this.node.active = true;
    }

    public hide() {
        this.node.active = false;
        this.okHandler = null;
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
        lb.lineHeight = size + 8;
        lb.color = color;
        lb.horizontalAlign = Label.HorizontalAlign.CENTER;
        lb.verticalAlign = Label.VerticalAlign.CENTER;
        lb.string = text;
        return lb;
    }

    private makeButton(parent: Node, text: string, x: number, y: number, w: number, h: number, bg: Color, onClick: () => void): Label {
        const node = new Node('Btn');
        node.parent = parent;
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform).setContentSize(w, h);
        node.setPosition(x, y, 0);

        const bgNode = new Node('Bg');
        bgNode.parent = node;
        bgNode.layer = Layers.Enum.UI_2D;
        const g = bgNode.addComponent(Graphics);
        g.fillColor = bg;
        g.roundRect(-w / 2, -h / 2, w, h, 14);
        g.fill();

        const lb = this.makeLabel(node, text, 0, 0, w, h, 30, COLOR_TEXT);
        node.on(Node.EventType.TOUCH_END, onClick, this);
        return lb;
    }
}
