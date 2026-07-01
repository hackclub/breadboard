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

        <h3>Your Design</h3>
        <p>
          We're looking for projects that are actually interesting to build and
          watch. Here's the bar:
        </p>
        <ul>
          <li>
            <strong>Cool input.</strong> Give people a real way to interact with
            your project. A single push button is not allowed, and one input on
            its own isn't enough. You must combine several ways for people to
            control your project: a keypad, a joystick, a rotary encoder, an RFID
            reader, an IR remote, and the like.
          </li>
          <li>
            <strong>Cool output.</strong> One blinking LED is the floor and
            won't pass on its own. Combine outputs like a screen, an addressable LED matrix, a
            motor, a servo, or a stepper. Make it move, display, or react in a
            way that's fun to watch!
          </li>
          <li>
            <strong>Cool sensors.</strong> Your project should sense multiple
            aspects from the real world and react to it. Things like motion,
            distance, weight, orientation, sound, light, temperature are examples
            of things that can be sensed.
          </li>
          <li>
            <strong>A real purpose.</strong> There should be a clear reason your
            project exists, and you should be able to say in one sentence why it
            needs a microcontroller at all. For instance, a puzzle box that
            releases its servo latch only after you present the right RFID card,
            type a keypad code, and give it a secret tilt-and-tap, dropping hints
            on a small screen as you go might be an interesting idea!
          </li>
          <li>
            <strong>It makes a decision.</strong> Your code has to actually
            think. Reacting to one reading isn't enough, like turning on a light
            just because it got dark. A real decision weighs more than one thing:
            it looks at several inputs, remembers what happened before, or acts
            differently over time. For example, unlock the door only if the right
            RFID card is tapped and then the correct keypad code is typed in
            time.
          </li>
          <li>
            <strong>Unique firmware.</strong> The code has to be yours, and it
            has to do real work. A copied example sketch or tutorial clone
            doesn't count. "Real work" means at least one of these:
            <ul>
              <li>
                <strong>A state machine:</strong> your project has distinct modes
                (say "idle", "armed", and "alarm") with rules for when it moves
                between them.
              </li>
              <li>
                <strong>A control loop:</strong> it keeps reading an input and
                adjusting an output to hit a target, the way a thermostat holds a
                temperature.
              </li>
              <li>
                <strong>Cleaning up sensor readings:</strong> smoothing or
                filtering noisy data so it's actually usable (see the{" "}
                <a
                  href="https://docs.arduino.cc/built-in-examples/digital/Debounce/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Debounce example
                </a>
                ).
              </li>
              <li>
                <strong>Non-blocking timing:</strong> doing several things at
                once without <code>delay()</code> freezing everything (see{" "}
                <a
                  href="https://docs.arduino.cc/built-in-examples/digital/BlinkWithoutDelay/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Blink Without Delay
                </a>
                ).
              </li>
              <li>
                <strong>Speaking a protocol:</strong> talking to a part over I2C,
                SPI, or serial.
              </li>
            </ul>
            New to these terms? That's fine! So was I ;) The two examples linked
            above are a great place to start! I heavily suggest doing your own
            research and not being afraid to ask questions.
          </li>
          <li>
            <strong>No AI-assisted coding.</strong> Write your own code.
          </li>
        </ul>
        <h3>Your README</h3>
        <p>
          Your README is people's first impression, so make it a good one.
          Someone landing on your repo should understand what your project is,
          what it does, and why it exists without opening a single file. If they
          have to dig through your code to figure it out, your README isn't
          doing its job.
        </p>
        <p>At minimum, your README.md needs to cover:</p>

        <p>
          <strong>1. What your project is</strong>
        </p>
        <ul className="list-none space-y-2 pl-0">
          <li className="flex gap-2">
            <span aria-hidden className="text-green-600">
              ✓
            </span>
            <span>
              A short description of your project. What makes it interesting?
              What does it do? How does it do what it does?
            </span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="text-green-600">
              ✓
            </span>
            <span>
              How you use it. What is the input? What does the input do? Output?
              What does it do? What is being sensed? What does the firmware do?
            </span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="text-green-600">
              ✓
            </span>
            <span>Why you made it. What did building this achieve?</span>
          </li>
        </ul>
        <p>Be descriptive!</p>

        <p>
          <strong>2. Pictures and diagrams</strong>
        </p>
        <ul className="list-none space-y-2 pl-0">
          <li className="flex gap-2">
            <span aria-hidden className="text-green-600">
              ✓
            </span>
            <span>
              Photos or screenshots of your project so it's obvious what it is.
            </span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="text-green-600">
              ✓
            </span>
            <span>A clear wiring diagram or schematic.</span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="text-green-600">
              ✓
            </span>
            <span>
              Anything else that helps someone understand how it fits together.
            </span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="text-green-600">
              ✓
            </span>
            <span>
              If you use the in-site simulator, link it in the README!
            </span>
          </li>
        </ul>

        <p>
          <strong>3. The files in your repo</strong>
        </p>
        <p>
          Someone else should be able to open your repo and rebuild your
          project. That means including:
        </p>
        <ul className="list-none space-y-2 pl-0">
          <li className="flex gap-2">
            <span aria-hidden className="text-green-600">
              ✓
            </span>
            <span>A BOM (Bill of Materials) as a CSV, with links to every part.</span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="text-green-600">
              ✓
            </span>
            <span>
              If you use KiCad or other platforms that support this, your
              wiring diagram or schematic file.
            </span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="text-green-600">
              ✓
            </span>
            <span>Your firmware source code.</span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="text-green-600">
              ✓
            </span>
            <span>Any libraries or references your project depends on.</span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="text-green-600">
              ✓
            </span>
            <span>Folders and files with clear, logical names.</span>
          </li>
        </ul>

        <h2>Stage 2: Build Submission</h2>
        <p>
          Once you receive your kit and build your project, you{" "}
          <strong>must</strong> submit your build.
        </p>
        <p>Your build submission must include:</p>
        <ul>
          <li>Photos of the finished breadboard circuit, fully assembled</li>
          <li>A demo video showing it actually working</li>
        </ul>

        <h2>Things That Will Get You Rejected</h2>
        <ul>
          <li>AI-generated code, designs, or writeups</li>
          <li>Copying someone else's project or a guide</li>
          <li>Missing files from the checklist above</li>
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
