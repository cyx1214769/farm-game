import { CROPS } from './CropConfig';
import { ANIMALS } from './AnimalConfig';

/**
 * 仓库里能放的东西：作物 + 动物产物。
 *
 * 市场和订单都不该关心"这是种出来的还是养出来的"，
 * 它们只要知道：这个 id 叫什么、卖多少钱。
 */
export interface ItemInfo {
    id: string;
    name: string;
    sellPrice: number;
    /** 卖的时候用什么颜色画（占位美术用） */
    color: string;
}

export function findItem(id: string): ItemInfo | null {
    for (let i = 0; i < CROPS.length; i++) {
        if (CROPS[i].id === id) {
            return {
                id: CROPS[i].id,
                name: CROPS[i].name,
                sellPrice: CROPS[i].sellPrice,
                color: CROPS[i].ripeColor,
            };
        }
    }
    for (let i = 0; i < ANIMALS.length; i++) {
        if (ANIMALS[i].productId === id) {
            return {
                id: ANIMALS[i].productId,
                name: ANIMALS[i].productName,
                sellPrice: ANIMALS[i].productPrice,
                color: ANIMALS[i].productColor,
            };
        }
    }
    // 动物卖掉换来的肉
    for (let i = 0; i < ANIMALS.length; i++) {
        if (ANIMALS[i].meatId === id) {
            return {
                id: ANIMALS[i].meatId,
                name: ANIMALS[i].meatName,
                sellPrice: ANIMALS[i].meatPrice,
                color: ANIMALS[i].meatColor,
            };
        }
    }
    return null;
}

/** 仓库里所有东西的 id（按"作物在前、产物在后"的固定顺序） */
export function allItemIds(): string[] {
    const list: string[] = [];
    for (let i = 0; i < CROPS.length; i++) {
        list.push(CROPS[i].id);
    }
    for (let i = 0; i < ANIMALS.length; i++) {
        list.push(ANIMALS[i].productId);
    }
    for (let i = 0; i < ANIMALS.length; i++) {
        list.push(ANIMALS[i].meatId);
    }
    return list;
}
