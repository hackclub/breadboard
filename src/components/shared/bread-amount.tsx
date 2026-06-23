import Image from "next/image";

export function BreadIcon({ size = "sm" }: { size?: "sm" | "md" | "lg" }) {
  const px = size === "lg" ? 24 : size === "md" ? 20 : 16;
  return (
    <Image
      src="/assets/bred.png"
      alt=""
      width={px}
      height={px}
      className="inline-block align-middle"
      unoptimized
    />
  );
}

export function BreadAmount({
  amount,
  size = "sm",
  label = true,
}: {
  amount: number;
  size?: "sm" | "md" | "lg";
  label?: boolean;
}) {
  const textSize =
    size === "lg" ? "text-5xl" : size === "md" ? "text-lg" : "text-sm";

  if (label) {
    return (
      <span className={`inline-flex items-center gap-1 font-black ${textSize}`}>
        <BreadIcon size={size} />
        {amount}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <BreadIcon size={size} />
      <span className={`font-black ${textSize}`}>{amount}</span>
    </span>
  );
}
