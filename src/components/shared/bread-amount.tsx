import Image from "next/image";

export function BreadIcon({
  size = "sm",
  gold = false,
}: {
  size?: "sm" | "md" | "lg";
  gold?: boolean;
}) {
  const px = size === "lg" ? 48 : size === "md" ? 36 : 28;
  return (
    <Image
      src={gold ? "/assets/goden_bred.png" : "/assets/bred.png"}
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
  gold = false,
}: {
  amount: number;
  size?: "sm" | "md" | "lg";
  label?: boolean;
  gold?: boolean;
}) {
  const textSize =
    size === "lg" ? "text-5xl" : size === "md" ? "text-lg" : "text-sm";

  if (label) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 font-black ${textSize}`}
      >
        <BreadIcon size={size} gold={gold} />
        {amount}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <BreadIcon size={size} gold={gold} />
      <span className={`font-black ${textSize}`}>{amount}</span>
    </span>
  );
}
