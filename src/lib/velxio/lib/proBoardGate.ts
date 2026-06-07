// @ts-nocheck
import type { BoardKind } from "@/lib/velxio/types/board";
import { isPiBoardKind, isStm32BoardKind } from "@/lib/velxio/types/board";

export type BoardGateDecision = "allow" | "block";

export function isProBoardKind(_kind: BoardKind | string): boolean {
  return false;
}

export function boardGateDecision(_kind: BoardKind): BoardGateDecision {
  return "allow";
}

export function triggerProUpgradePrompt(_featureName: string): void {}

export function proBoardFeatureName(kind: BoardKind | string): string {
  if (isStm32BoardKind(kind)) return "STM32 emulation";
  if (isPiBoardKind(kind)) return "Raspberry Pi emulation";
  return "this board";
}
