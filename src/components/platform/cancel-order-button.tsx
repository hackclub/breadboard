"use client";

import { useState } from "react";
import { cancelOrder } from "@/actions/shop";

export function CancelOrderButton({ orderId }: { orderId: number }) {
  const [cancelling, setCancelling] = useState(false);

  const cancel = async () => {
    if (!confirm(`Cancel order #${orderId}? Your bread will be returned.`)) {
      return;
    }

    setCancelling(true);
    try {
      await cancelOrder(orderId);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to cancel order");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <button
      type="button"
      onClick={cancel}
      disabled={cancelling}
      className="rounded-full border border-red-700 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      {cancelling ? "Cancelling..." : "Cancel order"}
    </button>
  );
}
