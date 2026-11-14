import { CardDemo } from "@/components/site/card-demo";

/** What the glass itself is made of. */
const STACK = ["WebGL", "SVG filters", "Canvas"];

export default function Home() {
  return (
    <main className="mx-auto max-w-[1000px] px-5 pt-20 pb-32 sm:px-8 sm:pt-32">
      <CardDemo
        header={
        <header className="max-w-[30rem]">
          <h1 className="font-heading text-[22px] leading-tight tracking-[-0.01em] text-balance">Liquid glass</h1>
          <p className="mt-2 font-heading text-[17px] leading-[1.55] tracking-[-0.005em] text-pretty text-muted-foreground">
            Move the card, tune the material, then copy the prompt into your AI tool to build the same glass in your own project.
          </p>
          <ul className="mt-5 flex flex-wrap gap-1.5" aria-label="Built with">
            {STACK.map((name) => (
              <li key={name} className="inline-flex h-7 items-center rounded-full bg-black/[0.045] px-3 font-mono text-[12px] text-foreground/70">
                {name}
              </li>
            ))}
          </ul>
        </header>
        }
      />
    </main>
  );
}
