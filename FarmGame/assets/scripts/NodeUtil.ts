import { Node } from 'cc';

/**
 * 清空一个节点的所有子节点，并且**真正销毁它们**。
 *
 * 注意：Cocos 的 `removeAllChildren()` 只是把子节点从父节点上摘下来，
 * 节点本身还在内存里。如果反复重建（比如面板每秒刷新），
 * 节点和它们的 Graphics 组件会越堆越多，最后把游戏撑崩。
 */
export function clearChildren(node: Node) {
    const kids = node.children.slice();
    for (let i = 0; i < kids.length; i++) {
        if (!kids[i].isValid) {
            continue;
        }
        kids[i].removeFromParent();
        kids[i].destroy();
    }
}
