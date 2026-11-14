import { CardDemo } from "@/components/site/card-demo";

/** What the glass itself is made of. */
const STACK = ["WebGL", "SVG filters", "Canvas"];

const REPO = "https://github.com/amanbairagi30/liquid-glass";

/** GitHub's mark (Octicons mark-github, MIT). Lucide no longer ships brand icons. */
function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={className}>
      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
    </svg>
  );
}

const LINK =
  "relative text-foreground underline decoration-black/15 underline-offset-4 transition-[text-decoration-color] duration-150 ease-out before:absolute before:-inset-x-1.5 before:-inset-y-2.5 hover:decoration-black/50 focus-visible:rounded-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none";

export default function Home() {
  return (
    <main className="mx-auto max-w-[1000px] px-5 pt-20 pb-32 sm:px-8 sm:pt-32">
      <CardDemo
        header={
        <header className="max-w-[30rem]">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h1 className="font-heading text-[22px] leading-tight tracking-[-0.01em] text-balance">Liquid glass</h1>
            {/* Set in the title's serif, one step quieter: the brackets read as part of the heading line. */}
            <span className="font-heading text-[17px] leading-tight text-muted-foreground">
              (
              <a
                href={REPO}
                target="_blank"
                rel="noreferrer"
                className="relative mx-[0.1em] inline-flex items-baseline gap-[0.3em] transition-[color] duration-150 ease-out before:absolute before:-inset-x-1.5 before:-inset-y-2.5 hover:text-foreground focus-visible:rounded-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <GitHubMark className="size-[0.72em] self-center" />
                GitHub
              </a>
              )
            </span>
          </div>
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
      <footer className="mt-28 flex items-center justify-center gap-2.5 text-[13px] text-muted-foreground sm:mt-36">
        <p>
          Built by{" "}
          <a href="https://www.amanbairagi.com" target="_blank" rel="noreferrer" className={LINK}>
            Aman
          </a>
        </p>
        <span aria-hidden className="size-[3px] rounded-full bg-current opacity-60" />
        <a href="https://x.com/amanbairagi30" target="_blank" rel="noreferrer" className={LINK}>
          Twitter
        </a>
      </footer>
    </main>
  );
}
