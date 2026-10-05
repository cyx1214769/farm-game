/**
 * 拖动地图的时候，手指抬起会顺带触发节点上的「点击」。
 * 这个共享标志用来屏蔽那一次点击。
 *
 * 之前用的是一个开关（打开就一直开着），一旦漏掉重置，
 * 整个游戏的点击就全废了。现在改成"时间戳"：
 * 拖动一次就把"屏蔽截止时间"往后推，过期自动失效，不可能卡死。
 */
export const InputGuard = {
    /** 在这个时间点（毫秒）之前，所有点击都忽略 */
    blockUntil: 0,

    /** 现在该不该忽略点击 */
    blocked(): boolean {
        return Date.now() < InputGuard.blockUntil;
    },

    /** 记录一次拖动：往后 400 毫秒内的点击都忽略 */
    markDragging(): void {
        InputGuard.blockUntil = Date.now() + 400;
    },
};
