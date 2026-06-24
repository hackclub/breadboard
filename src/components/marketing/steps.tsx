import Image from "next/image";
import Link from "next/link";
import {
  stepCardClass,
  stepImageClass,
  stepImageShellClass,
} from "@/components/shared/styles";

const steps = [
  {
    title: "Design Your Project",
    href: "/get-started",
    img: "/assets/design.png",
    alt: "Design project",
  },
  {
    title: "Receive Your Kit",
    href: "/requirements",
    img: "/assets/Recieve.png",
    alt: "Receive kit",
  },
  {
    title: "Build It!",
    href: "/gallery",
    img: "/assets/Build.png",
    alt: "Build project",
  },
];

export function Steps() {
  return (
    <section className="mx-auto max-w-[1440px] px-6 py-12">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {steps.map((step) => (
          <Link
            key={step.title}
            href={step.href}
            className={`group ${stepCardClass}`}
          >
            <div className="px-5 py-6">
              <h3 className="text-center text-[34px] font-medium tracking-[0.08em] text-white">
                {step.title}
              </h3>
            </div>
            <div className={stepImageShellClass}>
              <div className="relative h-[161px] w-full overflow-hidden">
                <Image
                  src={step.img}
                  alt={step.alt}
                  fill
                  sizes="(min-width:768px) 33vw, 100vw"
                  className={stepImageClass}
                />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
