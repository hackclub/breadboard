import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { FAQCards } from "@/components/marketing/faq-cards";
import { Hero } from "@/components/marketing/hero";
import { ScrollIndicator } from "@/components/marketing/scroll-indicator";
import { Steps } from "@/components/marketing/steps";
import { pageGridClass } from "@/components/shared/styles";

export default function Home() {
  return (
    <>
      <Header />
      <div className={`${pageGridClass} relative min-h-screen`}>
        <Hero />
        <Steps />
        <FAQCards />
        <ScrollIndicator />
      </div>
      <Footer />
    </>
  );
}
