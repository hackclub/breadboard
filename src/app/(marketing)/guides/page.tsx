import { PageHero, ProseCard } from "@/components/shared/docs-frame";

export default function GuidesPage() {
  return (
    <section>
      <PageHero title="Breadboard Basics">
        <p className="mt-2 text-base text-black/80">
          Complete Component Guide for the REXQualis Breadboard Kit
        </p>
      </PageHero>
      <ProseCard>
        <img
          src="https://cdn.hackclub.com/019d1703-fa25-78e5-8d80-ceb5073210c7/image.png"
          alt="Breadboard Kit"
        />

        <p>
          This tutorial is designed to help you become familiar with every
          component included in{" "}
          <a href="https://www.amazon.com/REXQualis-Electronics-tie-Points-Breadboard-Potentiometer/dp/B073ZC68QG">
            this breadboard kit
          </a>{" "}
          before you begin building circuits.
        </p>

        <p>By the end of this guide, you should be able to:</p>
        <ul>
          <li>Visually recognize each component</li>
          <li>Understand what each component does</li>
          <li>Know when and why each component is commonly used</li>
          <li>Avoid the most frequent beginner mistakes</li>
        </ul>

        <hr />

        <h2>1. Breadboard (830 Tie-Points)</h2>
        <img
          src="https://cdn.hackclub.com/019d1703-fca5-7990-9be5-2d2d1a957f20/image.png"
          alt="Breadboard"
        />

        <h3>What It Is</h3>
        <p>
          A breadboard is a reusable prototyping tool that allows electronic
          circuits to be assembled without soldering. It is the central platform
          on which most beginner circuits are built.
        </p>

        <h3>How It Works</h3>
        <p>
          Inside the breadboard, metal clips connect groups of holes together:
        </p>
        <ul>
          <li>The central rows are connected horizontally in groups.</li>
          <li>
            The long side rails are connected vertically and are typically used
            for power (positive voltage and ground).
          </li>
        </ul>
        <p>
          Because of this internal structure, components placed into the same
          connected row share an electrical connection.
        </p>

        <h3>Common Mistake</h3>
        <p>
          A frequent error is placing both legs of a component into the same
          horizontal row. When this happens, there is no voltage difference
          across the component, and it will not function as intended.
        </p>

        <hr />

        <h2>2. Breadboard Power Supply Module</h2>
        <img
          src="https://cdn.hackclub.com/019d1703-ff19-7e34-9b16-1c397545f7da/image.png"
          alt="Power Supply Module"
        />

        <h3>What It Is</h3>
        <p>
          This is a compact, regulated power supply module that plugs directly
          into the breadboard's power rails. It provides a stable voltage source
          for your circuits.
        </p>

        <h3>What It Provides</h3>
        <ul>
          <li>A regulated 5-volt output</li>
          <li>A regulated 3.3-volt output</li>
          <li>A shared ground (GND) reference</li>
          <li>An on/off power switch</li>
        </ul>

        <h3>Power Inputs</h3>
        <p>The module can be powered in two ways:</p>
        <ul>
          <li>Via USB (using the included USB cable)</li>
          <li>Via a 9-volt DC barrel jack (adapter not included)</li>
        </ul>

        <h3>Critical Rule</h3>
        <p>
          You must never connect a power rail (such as 5V) directly to ground.
          Doing so creates a short circuit, which can damage the power supply,
          the breadboard, or other components.
        </p>

        <hr />

        <h2>3. Jumper Wires</h2>

        <h3>What They Are</h3>
        <p>
          Jumper wires are flexible conductors used to make temporary electrical
          connections on a breadboard. Jumper wires allow you to connect
          components, rows, and power rails without soldering. They enable rapid
          changes and experimentation, which is essential during learning and
          prototyping.
        </p>

        <h3>Types Included in This Kit</h3>
        <ul>
          <li>Male-to-male jumper wires</li>
          <li>Male-to-female jumper wires</li>
          <li>Pre-cut solid solderless breadboard jumpers</li>
        </ul>
        <img
          src="https://cdn.hackclub.com/019d1704-013f-7394-868c-9ace49189c85/image.png"
          alt="Jumper Wires"
        />

        <hr />

        <h2>4. Resistors</h2>

        <h3>What They Do</h3>
        <p>
          Resistors limit the flow of electrical current and help control
          voltage levels within a circuit.
        </p>

        <h3>Values Included</h3>
        <p>This kit includes a wide range of resistor values, including:</p>
        <p>10Ω, 100Ω, 220Ω, 330Ω, 1kΩ, 2kΩ, 5kΩ, 10kΩ, 100kΩ, and 1MΩ.</p>

        <h3>Why They Matter</h3>
        <p>
          Without resistors, components such as LEDs, transistors, and
          integrated circuits can easily be damaged by excessive current.
        </p>

        <h3>Orientation</h3>
        <img
          src="https://cdn.hackclub.com/019d1704-0397-7187-9a1f-8c0a9e0e43e6/image.png"
          alt="Resistors"
        />
        <p>
          Resistors are non-polarized components, meaning their orientation does
          not matter.
        </p>

        <hr />

        <h2>5. LEDs (Light Emitting Diodes)</h2>

        <h3>What They Do</h3>
        <p>
          LEDs convert electrical energy into light and are commonly used as
          visual indicators.
        </p>
        <p>LEDs are polarized components:</p>
        <ul>
          <li>The longer leg is the anode (positive)</li>
          <li>The shorter leg is the cathode (negative)</li>
        </ul>
        <img
          src="https://cdn.hackclub.com/019d1704-05c0-7a18-829a-5ea2cd41cfe4/image.png"
          alt="LEDs"
        />

        <h3>Why They Matter</h3>
        <p>
          LEDs provide immediate visual feedback and are often used to indicate
          power, signal states, or activity.
        </p>

        <h3>Required Rule</h3>
        <p>
          An LED must always be used with a resistor in series. This resistor
          limits the current and prevents the LED from burning out.
        </p>

        <hr />

        <h2>6. Potentiometer (Precision Variable Resistor)</h2>

        <h3>What It Is</h3>
        <p>A resistor whose value changes as you turn the knob.</p>

        <h3>Pins</h3>
        <ul>
          <li>
            The two outer pins connect to the fixed ends of the resistive
            element.
          </li>
          <li>The center pin (called the wiper) outputs a variable voltage.</li>
        </ul>
        <img
          src="https://cdn.hackclub.com/019d1704-0805-74a0-b24e-70933cf29393/image.png"
          alt="Potentiometer"
        />

        <h3>Why It Matters</h3>
        <p>
          Potentiometers are commonly used for analog controls such as volume
          adjustment, brightness control, and speed regulation.
        </p>

        <hr />

        <h2>7. Push Buttons</h2>

        <h3>What They Do</h3>
        <p>
          Push buttons are momentary switches that connect or disconnect a
          circuit only while they are being pressed.
        </p>

        <h3>Internal Behavior</h3>
        <p>
          When pressed, most push buttons internally connect two of their pins
          together.
        </p>

        <h3>Common Use</h3>
        <p>
          Push buttons are often used for user input, reset functions, and
          manual triggers.
        </p>

        <h3>Common Mistake</h3>
        <p>
          A common error is inserting the button rotated 90 degrees, which
          prevents the internal contacts from aligning correctly with the
          breadboard connections.
        </p>
        <img
          src="https://cdn.hackclub.com/019d1704-0a3f-7c3e-adb4-79e28948a239/image.png"
          alt="Push Buttons"
        />

        <hr />

        <h2>8. Buzzer</h2>
        <p>The kit includes a buzzer used to generate sound output.</p>
        <ul>
          <li>
            An active buzzer produces sound when supplied with DC voltage.
          </li>
          <li>
            A passive buzzer requires an alternating signal to produce sound.
          </li>
        </ul>

        <h3>Why It Matters</h3>
        <img
          src="https://cdn.hackclub.com/019d1704-0c8e-755b-bed8-f4afa3a9b1d4/image.png"
          alt="Buzzer"
        />
        <p>
          Buzzers add auditory feedback to projects, such as alerts,
          confirmations, or warnings.
        </p>

        <hr />

        <h2>9. PN2222 NPN Transistor</h2>

        <h3>What It Is</h3>
        <p>
          The PN2222 is a bipolar junction transistor commonly used as an
          electronic switch or amplifier.
        </p>
        <p>Here's another video by Ben Eater!</p>
        <p>
          <a href="https://www.youtube.com/watch?v=DXvAlwMAxiA">
            How a transistor works
          </a>
        </p>
        <img
          src="https://cdn.hackclub.com/019d1704-0ea6-7ea1-8cc7-8351b258f28e/image.png"
          alt="PN2222 Transistor"
        />

        <h3>Why It Matters</h3>
        <p>
          This transistor allows a small control signal to switch or control a
          much larger current. This makes it essential for driving motors,
          buzzers, relays, and other higher-power components.
        </p>

        <h3>Common Mistake</h3>
        <p>
          Failing to use a resistor on the base pin can allow excessive current
          to flow, which may permanently damage the transistor.
        </p>

        <hr />

        <h2>10. 1N4007 Diode</h2>

        <h3>What It Does</h3>
        <p>The 1N4007 diode allows current to flow in only one direction.</p>
        <p>Here's a nice video on how they work by Ben Eater :D</p>
        <p>
          <a href="https://www.youtube.com/watch?v=33vbFFFn04k">
            How semiconductors work
          </a>
        </p>

        <h3>Orientation</h3>
        <p>The side marked with a stripe indicates the cathode.</p>

        <h3>Why It Matters</h3>
        <img
          src="https://cdn.hackclub.com/019d1704-c114-7fd2-930e-f14227b99001/image.png"
          alt="1N4007 Diode"
        />
        <p>
          This diode is commonly used for reverse-polarity protection and for
          suppressing voltage spikes generated by inductive loads such as motors
          and relays.
        </p>

        <hr />

        <h2>11. Electrolytic / Polarized Capacitors</h2>

        <h3>What They Do</h3>
        <p>
          Electrolytic capacitors store electrical energy and help smooth
          voltage fluctuations in a circuit.
        </p>
        <p>They come in 100 UF and 10 UF in the kit!</p>

        <h3>Key Property</h3>
        <p>
          They are <strong>polarized</strong>. Therefore, reversing polarity can
          destroy the capacitor.
        </p>
        <img
          src="https://cdn.hackclub.com/019d1704-c35d-7c94-b30a-8634fe5763d2/image.png"
          alt="Electrolytic Capacitors"
        />

        <hr />

        <h2>12. Ceramic Capacitors</h2>

        <h3>What They Do</h3>
        <p>
          They also store electrical energy and smooth voltage fluctuations.
        </p>
        <p>
          However, it is meant for small, fast-response capacitance. They come
          in 100 NF and 22 PF!
        </p>

        <h3>Key Property</h3>
        <p>
          They are non-polarized. That means that direction does not matter!
        </p>
        <img
          src="https://cdn.hackclub.com/019d1704-c592-779a-b803-3b91e976ee8a/image.png"
          alt="Ceramic Capacitors"
        />

        <hr />

        <h2>13. 74HC595 Shift Register IC</h2>

        <h3>What It Is</h3>
        <p>
          The 74HC595 is an 8-bit serial-to-parallel shift register. It is used
          to expand microcontroller outputs, allowing control of many devices
          (like LEDs) with few pins by converting serial data to parallel.
        </p>

        <h3>Typical Use</h3>
        <p>
          It is commonly used to drive LED arrays, displays, and other
          multi-output devices.
        </p>
        <img
          src="https://cdn.hackclub.com/019d1704-cb35-7af7-96c4-3a358f7d66a0/image.png"
          alt="74HC595 Shift Register"
        />

        <hr />

        <h2>14. 4N35 Optocoupler</h2>

        <h3>What It Is</h3>
        <p>
          The 4N35 is an optocoupler that uses light to transfer a signal
          between two electrically isolated circuits.
        </p>

        <h3>Why It Matters</h3>
        <p>
          Optocouplers improve safety and reduce electrical noise by preventing
          direct electrical connections between sensitive and high-power
          sections of a circuit.
        </p>
        <img
          src="https://cdn.hackclub.com/019d1704-cd58-7a2b-b6d3-9717bb9dd5c0/image.png"
          alt="4N35 Optocoupler"
        />
        <img
          src="https://cdn.hackclub.com/019d1704-cf6c-7859-abab-326415a9f3f7/image.png"
          alt="4N35 Pinout"
        />
      </ProseCard>
    </section>
  );
}
