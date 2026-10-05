import { _decorator, Component, Node, Label, Graphics, Color, UITransform, Layers, EventTouch } from 'cc';
import { findCrop } from './CropConfig';
import { clearChildren } from './NodeUtil';

const { ccclass } = _decorator;

const PANEL_W = 620;
const PANEL_H = 780;
const ROW_H = 170;

const COLOR_TEXT = new Color(255, 246, 228, 255);
const COLOR_GOLD = new Color(240, 200, 110, 255);
const COLOR_BTN_ON = new Color(226, 176, 74, 255);
const COLOR_BTN_OFF = new Color(112, 96, 78, 255);

/** 一条订单要求什么、给多少钱 */
export interface OrderItem {
    cropId: string;
    count: number;
}

export interface OrderData {
    id: number;
    items: OrderItem[];
    reward: number;
}

/**
 * 订单面板。
 * 只负责"把订单列出来、让玩家点交付"，能不能交付、扣什么、给多少钱，由 FarmGame 决定。
 */
@ccclass('OrderPanel')
export class OrderPanel extends Component {
    public onDeliver: ((orderId: number) => void) | null = null;
    public onClose: (() => void) | null = null;

    private rowRoot: Node = null!;

    // ================= 搭建 =================

    public build() {
        const mask = new Node('Mask');
        mask.parent = this.node;
        mask.layer = Layers.Enum.UI_2D;
        mask.addComponent(UITransform).setContentSize(2000, 3000);
        const mg = mask.addComponent(Graphics);
        mg.fillColor = new Color(0, 0, 0, 150);
        mg.rect(-1000, -1500, 2000, 3000);
        mg.fill();
        mask.on(Node.EventType.TOUCH_END, (e: EventTouch) => { e.propagationStopped = true; }, this);

        const panel = new Node('Panel');
        panel.parent = this.node;
        panel.layer = Layers.Enum.UI_2D;
        panel.addComponent(UITransform).setContentSize(PANEL_W, PANEL_H);
        const pg = panel.addComponent(Graphics);
        pg.fillColor = new Color(78, 60, 42, 255);
        pg.roundRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, 22);
        pg.fill();

        this.makeLabel(panel, '订 单', 0, PANEL_H / 2 - 62, PANEL_W, 70, 40, COLOR_TEXT);

        this.rowRoot = new Node('Rows');
        this.rowRoot.parent = panel;
        this.rowRoot.layer = Layers.Enum.UI_2D;
        this.rowRoot.addComponent(UITransform).setContentSize(PANEL_W - 40, PANEL_H - 260);
        this.rowRoot.setPosition(0, 10, 0);

        this.makeButton(panel, '关闭', 0, -PANEL_H / 2 + 72, 220, 78, new Color(120, 96, 70, 255), () => {
            if (this.onClose) {
                this.onClose();
            }
        });

        this.node.active = false;
    }

    // ================= 对外接口 =================

    public setVisible(visible: boolean) {
        this.node.active = visible;
    }

    public refresh(orders: OrderData[], inventory: Record<string, number>) {
        clearChildren(this.rowRoot);

        const areaH = this.rowRoot.getComponent(UITransform)!.contentSize.height;

        for (let i = 0; i < orders.length; i++) {
            const order = orders[i];
            const y = areaH / 2 - ROW_H / 2 - i * ROW_H;
            const ok = this.canDeliver(order, inventory);

            const row = new Node(`Order_${order.id}`);
            row.parent = this.rowRoot;
            row.layer = Layers.Enum.UI_2D;
            row.addComponent(UITransform).setContentSize(PANEL_W - 60, ROW_H - 14);
            row.setPosition(0, y, 0);

            // 要求
            this.makeLabel(row, this.describe(order), 0, 54, PANEL_W - 100, 50, 28, COLOR_TEXT);

            // 报酬
            this.makeLabel(row, `报酬 ${order.reward} 金`, 0, 6, PANEL_W - 100, 46, 28, COLOR_GOLD);

            // 交付按钮：仓库不够就变灰
            const id = order.id;
            this.makeButton(row, ok ? '交付' : '缺货', 0, -52, 180, 66,
                ok ? COLOR_BTN_ON : COLOR_BTN_OFF,
                () => {
                    if (this.onDeliver) {
                        this.onDeliver(id);
                    }
                });
        }
    }

    // ================= 内部 =================

    private describe(order: OrderData): string {
        const parts: string[] = [];
        for (let i = 0; i < order.items.length; i++) {
            const item = order.items[i];
            const crop = findCrop(item.cropId);
            parts.push(`${crop ? crop.name : item.cropId} × ${item.count}`);
        }
        return parts.join('  +  ');
    }

    /** 仓库里的货够不够交这单 */
    public canDeliver(order: OrderData, inventory: Record<string, number>): boolean {
        for (let i = 0; i < order.items.length; i++) {
            const item = order.items[i];
            if ((inventory[item.cropId] || 0) < item.count) {
                return false;
            }
        }
        return true;
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
        lb.lineHeight = size + 6;
        lb.color = color;
        lb.horizontalAlign = Label.HorizontalAlign.CENTER;
        lb.verticalAlign = Label.VerticalAlign.CENTER;
        lb.string = text;
        return lb;
    }

    private makeButton(parent: Node, text: string, x: number, y: number, w: number, h: number, bg: Color, onClick: () => void) {
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
        g.roundRect(-w / 2, -h / 2, w, h, 12);
        g.fill();

        this.makeLabel(node, text, 0, 0, w, h, 28, COLOR_TEXT);

        node.on(Node.EventType.TOUCH_END, onClick, this);
    }
}
