import { PageHero, ProseCard } from "@/components/shared/docs-frame";

export default function RequirementsPage() {
  return (
    <section>
      <PageHero title="Submitting your Project">
        <p className="mt-2 text-base text-black/80">
          Everything you need to know before you submit.
        </p>
      </PageHero>

      <ProseCard>
        <p>
          Built something cool? Awesome. Here's what you need to do before we
          ship you anything.
        </p>
        <p>There are two submission stages:</p>
        <ol>
          <li>
            <strong>Design Submission:</strong> before we ship you the kit
          </li>
          <li>
            <strong>Build Submission:</strong> required after you receive and
            build it
          </li>
        </ol>
        <p>
          <strong>
            Both are required. You must ship the build, not just the design.
          </strong>
        </p>

        <p className="text-center !text-xl text-red-600">
          <strong>
            95% of rejections are fixable in under 5 minutes. Read this
            carefully.
          </strong>
        </p>

        <p>
          Stuck? Ask in <a href="https://hackclub.slack.com">#breadboard</a>.
        </p>

        <div className="not-prose my-6 rounded-[10px] border-[1.1px] border-black bg-white p-6 shadow-[3px_3px_0_#000]">
          <p className="mb-3 text-sm font-bold tracking-wide text-black uppercase">
            A shipped design means both of these:
          </p>
          <ul className="space-y-3 text-sm text-black">
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.1px] border-black bg-black text-xs text-white">
                1
              </span>
              <span>
                <strong>
                  Firmware, if your project has a microcontroller.
                </strong>{" "}
                Even if it's untested, it needs to exist and be in your repo. A
                microcontroller with no code is just a paperweight.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.1px] border-black bg-black text-xs text-white">
                2
              </span>
              <span>
                <strong>A working physical build with a demo.</strong> You built
                it, you proved it works. A video showing it doing its thing is
                required at the build stage!
              </span>
            </li>
          </ul>
        </div>

        <h2>Stage 1: Design Submission</h2>
        <p>
          This is what you submit before we send you anything. It should prove
          that you've thought your project through and that someone else could
          understand and replicate it.
        </p>

        <h3>Your README</h3>
        <p>
          Imagine someone stumbles onto your repo with zero context. Can they
          figure out what your project is without opening a single file?
        </p>
        <p>If not, your README needs work. At minimum, cover:</p>
        <ul>
          <li>What your project is and what makes it interesting</li>
          <li>How it works and how you use it</li>
          <li>
            Why you made it. Get personal! What problem were you solving? What
            did you want to learn?
          </li>
          <li>A clear wiring diagram or schematic</li>
        </ul>

        <h3>Your Design</h3>
        <p>Your project must:</p>
        <ul>
          <li>
            Be your own original work. You cannot AI generate anything, and you
            cannot simply copy any tutorials!
          </li>
          <li>
            Use several components from the kit (think shift registers,
            optocouplers, rotary encoders, etc.)
          </li>
          <li>Have a complete wiring diagram or schematic</li>
          <li>Have firmware.</li>
        </ul>

        <p>Your repo must include:</p>
        <ul>
          <li>A BOM (Bill of Materials) as a CSV, with links to every part</li>
          <li>Your wiring diagram or schematic file</li>
          <li>Firmware source code</li>
          <li>Any libraries or references your project depends on</li>
          <li>Folders and files with clear, logical names</li>
        </ul>

        <h2>Stage 2: Build Submission</h2>
        <p>
          Once you receive your kit and build your project, you{" "}
          <strong>must</strong> submit your build. This is not optional.
          Receiving the kit and going silent is not okay.
        </p>
        <p>Your build submission must include:</p>
        <ul>
          <li>Photos of the finished breadboard circuit, fully assembled</li>
          <li>A demo video showing it actually working</li>
          <li>
            A build log covering what you made, the decisions you made along the
            way, and what went wrong
          </li>
        </ul>

        <h2>Things That Will Get You Rejected</h2>
        <ul>
          <li>AI-generated code, designs, or writeups</li>
          <li>Copying someone else's project or a guide</li>
          <li>Missing files from the checklist above</li>
          <li>Not submitting your build after receiving the kit</li>
        </ul>

        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">
          <strong>Warning:</strong> Submitting stolen or AI-generated work can
          result in a permanent ban from this program and other Hack Club
          programs. Don't do it.
        </div>
      </ProseCard>
    </section>
  );
}
