import { PageHero, ProseCard } from "@/components/shared/docs-frame";

export default function WorkshopPage() {
  return (
    <section>
      <PageHero title="LED Workshop">
        <p className="mt-2 text-base text-black/80">
          Build and Control a Circuit
        </p>
      </PageHero>

      <ProseCard>
        <h2>What You Will Build</h2>
        <p>
          By the end of this tutorial, you will power a breadboard and turn on
          an LED safely using only basic components from the kit.
        </p>

        <hr />

        <p>
          A breadboard lets you build circuits{" "}
          <strong>without soldering</strong>.
        </p>
        <ul>
          <li>
            Each <strong>row</strong> of holes is electrically connected{" "}
            <strong>horizontally</strong>
          </li>
          <li>
            The long side rails are for{" "}
            <strong>
              power (Voltage and GND; the PSU includes 3V3 and 5V)
            </strong>
          </li>
          <li>The center gap separates the left and right halves</li>
        </ul>
        <p>
          If two metal legs are in the same row, electricity can flow between
          them.
        </p>
        <img
          src="https://cdn.hackclub.com/019d1727-d909-7ddc-8dc8-01e7eed06d3f/image.png"
          alt="Breadboard Annotated"
        />

        <hr />

        <h2>Challenge 1: LED On/Off with Button</h2>
        <blockquote>
          <p>
            This project is built <strong>in Tinkercad Circuits</strong>, not on
            real hardware yet.
          </p>
          <p>
            Tinkercad simulates real electronic behavior, so the habits you
            build here will transfer directly to a physical breadboard later.
          </p>
        </blockquote>

        <hr />

        <h3>What You Will Build</h3>
        <p>By the end of this challenge, you will have:</p>
        <ul>
          <li>
            A button that turns an LED{" "}
            <strong>on only while it is pressed</strong>
          </li>
          <li>
            An expanded version where{" "}
            <strong>one button controls multiple LEDs</strong>
          </li>
        </ul>
        <p>
          You will start with a simple circuit and then{" "}
          <strong>extend it</strong>, not rebuild it.
        </p>

        <hr />

        <h3>Getting Started in Tinkercad</h3>
        <ol>
          <li>
            Go to <strong>tinkercad.com</strong> and sign in
          </li>
          <li>
            Click <strong>Circuits</strong> &rarr;{" "}
            <strong>Create New Circuit</strong>
            <ol>
              <li>
                <strong>
                  Here, do these three tutorials! They are very useful and
                  informative
                </strong>
                <img
                  src="https://cdn.hackclub.com/019d1727-dbbb-71bd-b3de-2319ee183cd5/image.png"
                  alt="Tinkercad tutorials"
                />
              </li>
              <li>
                After finishing these, take a screenshot of the end result for
                each tutorial! You&rsquo;ll need these later.
              </li>
              <li>
                After that, also do these! Take a screenshot of the end result
                for each tutorial! You&rsquo;ll need these later.
                <img
                  src="https://cdn.hackclub.com/019d1727-ddfb-7c5a-9571-0c5134f4449f/image.png"
                  alt="More Tinkercad tutorials"
                />
              </li>
            </ol>
          </li>
          <li>
            Now, create a <strong>brand new project!</strong>
          </li>
          <li>
            From the components panel:
            <ul>
              <li>
                Drag in a <strong>Breadboard</strong> &mdash; Both the
                Breadboard Small and Breadboard work!
                <img
                  src="https://cdn.hackclub.com/019d1727-e045-76dc-a18c-8a6c50b83c34/image.png"
                  alt="Breadboard component"
                />
              </li>
              <li>
                Drag in a <strong>Power Supply</strong>
                <img
                  src="https://cdn.hackclub.com/019d1727-e2a1-73bc-93a3-998226c4e601/image.png"
                  alt="Power Supply component"
                />
              </li>
              <li>
                Now connect red to red and black to black. The red wire carries
                voltage, and the black wire is ground.
              </li>
              <li>Change the color of each!</li>
              <li>
                At the end, it should look like this:
                <img
                  src="https://cdn.hackclub.com/019d1727-e4f0-7d0d-ac19-417ce88aa4b9/image.png"
                  alt="Wired breadboard"
                />
              </li>
              <li>
                Drag in one <strong>LED</strong> and one{" "}
                <strong>resistor</strong>. Connect them as such, then wire them!
                Use different rows/columns than me, just to challenge yourself.
                <img
                  src="https://cdn.hackclub.com/019d1727-e754-728d-95bb-c0bc81c5638c/image.png"
                  alt="LED and resistor wired"
                />
              </li>
            </ul>
          </li>
        </ol>

        <p>
          You can zoom, pan, and rotate components freely. Take your time
          arranging things neatly; it helps you understand the connections
          better.
        </p>

        <p>
          <strong>Here&rsquo;s what&rsquo;s happening here</strong>
        </p>

        <h3>1. Power to the power rail</h3>
        <p>
          You&rsquo;re taking the <strong>positive output</strong> of your power
          supply and connecting it to the <strong>red power rail</strong> on the
          breadboard. This rail becomes the source of <strong>voltage</strong>{" "}
          for the entire circuit.
        </p>

        <h3>2. Ground to the ground rail</h3>
        <p>
          You&rsquo;re connecting the <strong>ground (GND)</strong> of your
          power supply to the <strong>blue/black rail</strong> on the
          breadboard. This rail becomes the <strong>return path</strong> for the
          circuit.
        </p>

        <h3>3. Resistor from power rail to LED</h3>
        <p>
          You place a <strong>resistor</strong> between the power rail and the
          LED&rsquo;s positive leg. The resistor&rsquo;s job is to{" "}
          <strong>limit current</strong> so the LED doesn&rsquo;t burn out.
        </p>

        <h3>4. LED gets voltage</h3>
        <p>
          The LED&rsquo;s <strong>anode (long leg)</strong> connects to the
          resistor, which connects to the power rail. This means the LED
          receives <strong>voltage,</strong> the electrical &ldquo;push&rdquo;
          that makes current flow.
        </p>

        <h3>5. LED ground</h3>
        <p>
          The LED&rsquo;s <strong>cathode (short leg)</strong> goes to the{" "}
          <strong>ground rail</strong>, completing the circuit.
        </p>

        <h2>Electricity Basics</h2>

        <hr />

        <h3>What &ldquo;ground&rdquo; actually means here</h3>
        <p>
          Ground is the <strong>reference point</strong> for the entire circuit.
          Think of it as the <strong>zero level</strong> that everything else is
          measured against.
        </p>
        <ul>
          <li>
            Voltage is always measured <strong>relative to ground</strong>.
          </li>
          <li>
            Current flows{" "}
            <strong>
              from power &rarr; through components &rarr; back to ground
            </strong>
            .
          </li>
          <li>
            Without ground, the circuit has <strong>no return path</strong>, so
            nothing works.
          </li>
        </ul>
        <p>
          Ground isn&rsquo;t &ldquo;negative energy&rdquo;; it&rsquo;s simply
          the <strong>other side of the loop</strong>.
        </p>
        <p>
          <a href="https://www.build-electronic-circuits.com/what-is-ground/">
            Check this for more information!
          </a>
        </p>
        <p>Additionally, here&rsquo;s some ground!</p>
        <img
          src="https://cdn.hackclub.com/019d1727-e9bb-75dc-87a9-4cf6c6538862/image.png"
          alt="Grass"
        />

        <h3>What voltage is, and why it matters</h3>
        <p>
          Voltage is the <strong>electrical pressure</strong> that pushes
          electrons through the circuit.
        </p>
        <ul>
          <li>Higher voltage = stronger push</li>
          <li>Lower voltage = weaker push</li>
        </ul>
        <p>For an LED:</p>
        <ul>
          <li>
            Too <strong>low</strong> voltage &rarr; LED won&rsquo;t turn on
          </li>
          <li>
            Too <strong>high</strong> voltage &rarr; LED tries to pull too much
            current and burns out
          </li>
        </ul>
        <p>
          Voltage matters because every component is designed to operate within
          a certain range.
        </p>
        <p>
          <a href="https://battlebornbatteries.com/what-are-volts/?srsltid=AfmBOoq2a-NWzu9QzU4y2rCSIqEydhqyE-QsEUiqbilRdl8T43YO8uKB">
            Check this for more information!
          </a>
        </p>
        <img
          src="https://cdn.hackclub.com/019d1727-ec23-73ad-9ac5-0373f6347d5d/image.png"
          alt="Low voltage"
        />

        <h3>What current is, and why it matters</h3>
        <p>
          Current is the <strong>amount of electrical flow</strong> through the
          circuit.
        </p>
        <ul>
          <li>Voltage is the push</li>
          <li>Current is the flow caused by that push</li>
        </ul>
        <p>
          LEDs are <strong>current-sensitive</strong> devices. They don&rsquo;t
          care much about voltage; they care about{" "}
          <strong>how much current flows through them</strong>.
        </p>

        <h3>Why too much current is bad</h3>
        <p>If you let too much current flow:</p>
        <ul>
          <li>The LED overheats</li>
          <li>The semiconductor junction gets damaged</li>
          <li>It permanently burns out</li>
        </ul>
        <p>
          This is why you add a <strong>resistor;</strong> it limits current to
          a safe level.
        </p>

        <h3>HOWEVER,</h3>
        <p>
          <strong>
            The <em>reason</em> too much current happens is because the{" "}
            <em>voltage</em> is too high.
          </strong>
        </p>
        <p>
          Voltage is the <strong>push</strong>. If the push is too strong, the
          LED is <em>forced</em> to draw more current than it can survive.
        </p>
        <p>So the real chain is:</p>
        <p>
          <strong>
            Too much voltage &rarr; too much current &rarr; LED damage
          </strong>
        </p>
        <p>
          The resistor fixes this by dropping voltage and limiting current so
          the LED only gets what it can safely handle.
        </p>
        <p>
          A tiny straw (LED) can only handle a small flow. If you crank up the
          pressure (voltage), the straw bursts. But having a huge bucket of
          water (a power supply capable of lots of current) is harmless. The
          straw only takes what it can.
        </p>
        <img
          src="https://cdn.hackclub.com/019d1725-77f0-7227-9fba-a307b522ab4f/electrician-electric-shock.gif"
          alt="Electric shock"
        />

        <hr />

        <h2>How can I calculate the value I need on my resistor?</h2>
        <p>Great question!</p>
        <p>
          You only need <strong>three numbers</strong>:
        </p>
        <ol>
          <li>
            <strong>Supply voltage</strong> (what your power source provides)
          </li>
          <li>
            <strong>LED forward voltage</strong> (how much voltage the LED
            &ldquo;drops&rdquo;)
          </li>
          <li>
            <strong>Desired LED current</strong> (usually 10&ndash;20 mA for
            typical LEDs, I&rsquo;ll use 20mA!)
          </li>
        </ol>
        <img
          src="https://cdn.hackclub.com/019d172b-7dbf-735d-8073-1cbba9bfae6c/image.png"
          alt="Resistor formula"
        />
        <img
          src="https://cdn.hackclub.com/019d172b-804e-713d-a111-8e0e22c9f958/image.png"
          alt="LED resistor calculator"
        />
        <p>
          However, this is only the minimum needed! More can be added to be on
          the safe side, or have a dimmer LED:
        </p>
        <img
          src="https://cdn.hackclub.com/019d172b-82b1-7d4c-a6c1-83e74288ca5d/image.png"
          alt="Resistor values"
        />
        <p>Here&rsquo;s a table of the values you may need:</p>
        <table>
          <thead>
            <tr>
              <th>LED Color</th>
              <th>Typical Forward Voltage (V_LED)</th>
              <th>Target Current</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Red</td>
              <td>2.0 V</td>
              <td>20 mA</td>
            </tr>
            <tr>
              <td>Yellow</td>
              <td>2.1 V</td>
              <td>20 mA</td>
            </tr>
            <tr>
              <td>Green</td>
              <td>2.2 V</td>
              <td>20 mA</td>
            </tr>
            <tr>
              <td>Blue</td>
              <td>3.0 V</td>
              <td>20 mA</td>
            </tr>
            <tr>
              <td>White</td>
              <td>3.0 V</td>
              <td>20 mA</td>
            </tr>
          </tbody>
        </table>

        <p>
          For this example, I will be using a red LED.{" "}
          <strong>For your schematic, use a different color!</strong>
        </p>
        <p>R = (V_supply &minus; V_f) / I</p>
        <p>Plug in the values:</p>
        <p>
          R = (5V &minus; 2.0V) / 20mA
          <br />R = 3V / 0.02A
          <br />R = 150&Omega;
        </p>
        <p>
          So the <strong>minimum resistor value</strong> we want is{" "}
          <strong>150&Omega;</strong>.
        </p>

        <h3>How resistor values are chosen</h3>
        <p>
          Real resistors only come in standard values. The way these values are
          chosen is really interesting! You should read about it{" "}
          <a href="https://eepower.com/resistor-guide/resistor-standards-and-codes/resistor-values/">
            here
          </a>
          !
        </p>
        <p>Your kit includes:</p>
        <p>
          10&Omega;, 100&Omega;, 220&Omega;, 330&Omega;, 1K&Omega;, 2K&Omega;,
          5K&Omega;, 10K&Omega;, 100K&Omega;, 1M&Omega;
        </p>
        <p>
          We calculated <strong>150&Omega;</strong>, but the kit does{" "}
          <strong>not</strong> include 150&Omega;.
        </p>
        <p>
          So we choose the <strong>next higher safe value</strong>:
        </p>
        <ul>
          <li>100&Omega; &rarr; too low (too much current)</li>
          <li>220&Omega; &rarr; safe choice</li>
        </ul>
        <p>
          <strong>Minimum (calculated): 150&Omega;</strong>
        </p>
        <p>
          <strong>Value used from the kit: 220&Omega;</strong>
        </p>
        <p>
          Click on the resistor and change the resistor value to the value you
          calculated. I used 220&Omega;, as shown here:
        </p>
        <img
          src="https://cdn.hackclub.com/019d172b-8501-7377-bf05-1fa462d5c6aa/image.png"
          alt="Resistor value setting"
        />
        <p>Now click &ldquo;start simulation,&rdquo; and watch it work!</p>
        <img
          src="https://cdn.hackclub.com/019d172b-8794-7b0b-863d-ecf07bfbce57/image.png"
          alt="Simulation running"
        />

        <h2>Part 1: Single LED Controlled by a Button</h2>
        <h3>Goal</h3>
        <ul>
          <li>
            The LED is <strong>off</strong> when the button is not pressed
          </li>
          <li>
            The LED turns <strong>on</strong> only while the button is pressed
          </li>
        </ul>
        <p>
          If the LED stays on or never turns on, that simply means a connection
          needs adjustment.
        </p>

        <hr />

        <h3>Helpful Notes Before Wiring</h3>
        <ul>
          <li>
            <strong>LED polarity matters</strong> &mdash; The anode connects
            toward the positive side; the cathode connects toward ground
          </li>
          <li>
            <strong>The resistor protects the LED</strong> &mdash; It must be in
            series with the LED; it may be placed on either side
          </li>
          <li>
            <strong>The button is momentary</strong> &mdash; It closes the
            circuit only while pressed
          </li>
          <li>
            <strong>A complete circuit needs ground</strong> &mdash; Current
            must have a path back to the negative terminal
          </li>
        </ul>
        <p>With that in mind, just add the button!</p>
        <img
          src="https://cdn.hackclub.com/019d172b-8a2b-723f-90e5-581fd86a4d5c/image.png"
          alt="Button added"
        />

        <blockquote>
          <p>
            <strong>
              Note: MAKE SURE THE LED IS ON THE OTHER SIDE!!! OR ELSE IT WILL
              JUST STAY CONNECTED TO THE VOLTAGE!!!
            </strong>
          </p>
        </blockquote>

        <img
          src="https://cdn.hackclub.com/019d172c-f758-73ba-b938-688cd157466c/push-button-pinout.gif"
          alt="Push button pinout"
        />
        <p>
          <em>Note: this diagram is flipped 90 degrees!</em>
        </p>

        <img
          src="https://cdn.hackclub.com/019d172d-c146-76e2-9d66-7e31f4251c04/image.png"
          alt="Button circuit"
        />
        <p>Here, when the button is pressed, all four sides are connected!</p>

        <hr />

        <h3>What&rsquo;s Happening in the Circuit</h3>
        <ul>
          <li>
            When the button is <strong>not pressed</strong>, the circuit is open
            and no current flows
          </li>
          <li>
            When the button <strong>is pressed</strong>, the circuit closes and
            current flows through the resistor and LED
          </li>
          <li>The LED lights because current is allowed to flow</li>
        </ul>
        <p>
          You are controlling <strong>current flow</strong>, not the LED
          directly.
        </p>

        <hr />

        <h3>If the Circuit Does Not Behave as Expected</h3>
        <p>Try checking:</p>
        <ul>
          <li>Are the LED&rsquo;s two pins connected to different nodes?</li>
          <li>Is the resistor in series with the LED?</li>
          <li>Is the button actually between the power source and the LED?</li>
          <li>Is ground connected?</li>
        </ul>
        <p>
          Use <strong>Start Simulation</strong> to observe changes as you adjust
          connections.
        </p>
        <p>Here&rsquo;s an assembly I created IRL with my kit!</p>
        <img
          src="https://cdn.hackclub.com/019d172e-5d47-701f-9471-5a9233d0a2b9/img_0464_360.gif"
          alt="Real breadboard assembly"
        />

        <hr />

        <h2>Part 3: Expanding to Multiple LEDs</h2>
        <p>
          Now you will <strong>build on the same circuit</strong>.
        </p>

        <h3>New Goal</h3>
        <ul>
          <li>
            Pressing the button turns <strong>multiple LEDs on</strong>
          </li>
          <li>
            Releasing the button turns <strong>all of them off</strong>
          </li>
        </ul>

        <hr />

        <h3>Important Rule</h3>
        <p>
          Each LED must have <strong>its own resistor</strong>.
        </p>
        <p>
          Even if Tinkercad allows one resistor to &ldquo;work,&rdquo; using
          separate resistors is the correct and safe way to build the circuit.{" "}
          <a href="https://electronics.stackexchange.com/questions/22291/why-exactly-cant-a-single-resistor-be-used-for-many-parallel-leds">
            Here&rsquo;s a detailed explanation
          </a>
        </p>
        <img
          src="https://cdn.hackclub.com/019d172e-e12a-7d91-a64d-02bafdc2f0a0/image.webp"
          alt="Don't share resistors"
        />

        <blockquote>
          <p>
            <strong>Don&rsquo;t do this!</strong> Sharing a single resistor
            across multiple LEDs causes uneven current distribution. LEDs have
            slightly different forward voltages, so one will hog more current
            than the others, burn brighter, and burn out faster. In the worst
            case, it can damage all the LEDs in the group.
          </p>
        </blockquote>

        <hr />

        <h3>How to Expand the Circuit</h3>
        <ul>
          <li>Keep the button exactly as it is</li>
          <li>
            From the button&rsquo;s output, create{" "}
            <strong>multiple parallel paths</strong>, each containing:
            <ul>
              <li>One resistor</li>
              <li>One LED</li>
              <li>A return to ground</li>
            </ul>
          </li>
        </ul>
        <p>All LEDs should turn on and off together.</p>

        <hr />

        <p>
          These are the basics of a breadboard. If you have any questions, ask
          in{" "}
          <a href="https://hackclub.enterprise.slack.com/archives/C09EB0AE68M">
            #breadboard
          </a>
          . The actual project you build will be far more complex, with real
          firmware and components you choose yourself. This is just to get you
          started!
        </p>
      </ProseCard>
    </section>
  );
}
