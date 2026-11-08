import { DRAG_TAP_THRESHOLD_PX, VECTOR_IDLE_ANGLE } from "../game/config";
import { RiftCouplingBoard } from "../game/board";

export function needleAngleForSlot(slot: number, count: number): number {
  return RiftCouplingBoard.needleAngle(slot, count);
}

export function isTap(downX: number, downY: number, x: number, y: number): boolean {
  return Math.hypot(x - downX, y - downY) <= DRAG_TAP_THRESHOLD_PX;
}

export const IDLE_ANGLE = VECTOR_IDLE_ANGLE;
