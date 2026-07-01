import { PageHero, ProseCard } from "@/components/shared/docs-frame";

export default function GetStartedPage() {
  return (
    <section>
      <PageHero title="Start here!">
        <p className="mt-2 text-base text-black/80">
          Welcome to Breadboard! The general flow is simple: design a project,
          receive a kit, and submit your build.
        </p>
      </PageHero>

      <ProseCard>
        <h2>1. Read the docs first</h2>

        <h3>Submitting your project</h3>
        <ul>
          <li>
            <a href="/requirements">
              <strong>Requirements</strong>
            </a>{" "}
            teaches you everything you need to make a{" "}
            <a href="/project-resources/what-is-a-shipped-project">
              shipped project
            </a>
          </li>
          <li>
            <a href="/project-resources/good-journaling">
              <strong>Good Journaling</strong>
            </a>{" "}
            teaches you how to keep track of your progress while working on your
            project
          </li>
        </ul>

        <h3>Resources</h3>
        <ul>
          <li>
            <a href="/guides">
              <strong>Breadboard Basics</strong>
            </a>{" "}
            covers the fundamental breadboard components
          </li>
          <li>
            <a href="/workshop">
              <strong>LED Workshop</strong>
            </a>{" "}
            walks you through building and controlling a basic circuit
          </li>
          <li>
            <a href="/guides/firmware">
              <strong>Firmware Guide</strong>
            </a>{" "}
            explains how to write and flash code onto your board
          </li>
        </ul>

        <h2>2. Pick an idea and choose your kit</h2>
        <p>
          Figure out what you want to build, then decide which kit fits best.
          Don't just think about what you <em>need</em>, think about what would
          make it cooler.
        </p>
        <blockquote>
          <p>
            A tamagotchi only needs a screen, buzzer, and buttons. But wouldn't
            a motion detector be SO COOL so it wakes up when there's motion? Or
            a light sensor so it can sleep in the dark?
          </p>
        </blockquote>
        <p>Whatever you pick, your design has to clear this bar:</p>
        <ul>
          <li>Combine several ways to interact, one button isn't enough.</li>
          <li>
            Do more than blink an LED: a screen, LED matrix, motor, or servo.
          </li>
          <li>Sense multiple things from the real world and react to them.</li>
          <li>One sentence on why it needs a microcontroller at all.</li>
          <li>
            Your code weighs several inputs, remembers, or changes over time.
          </li>
          <li>
            Your own code doing real work: a state machine, control loop, sensor
            filtering, non-blocking timing, or a protocol like I2C/SPI/serial.
          </li>
          <li>No AI-assisted coding, write your own code.</li>
        </ul>
        <p>
          For more details, <a href="/requirements">click here</a>.
        </p>
        <p>
          Check out <a href="https://github.com/qcoral/">@alexren</a>'s{" "}
          <a href="http://hwdocs.hackclub.dev">hwdocs.hackclub.dev</a> for extra
          tips and inspiration.
        </p>
        <p>
          The two available kits are below. Pick the one that best fits your
          idea.
        </p>

        <div className="flex flex-col gap-8 lg:flex-row lg:gap-8">
          <div className="min-w-0 flex-1">
            <h3>
              <a href="https://www.alibaba.com/product-detail/Basic-Starter-Kit-for-ESP32-ESP_1601458696838.html">
                Kit B: ESP32 Starter Kit
              </a>
            </h3>
            <details>
              <summary className="cursor-pointer font-bold">Components</summary>
              <table>
                <thead>
                  <tr>
                    <th>Component</th>
                    <th>Qty</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>ESP32 Development Board</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>0.96" OLED Display</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>DHT11 Temperature &amp; Humidity Module</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>HC-SR501 PIR Motion Sensor</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>Obstacle Avoidance Module</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>Photosensitive Resistor Module</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>Resistors (220Ω / 1K / 10K)</td>
                    <td>30</td>
                  </tr>
                  <tr>
                    <td>Potentiometer 10K</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>Passive Buzzer</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>Active Buzzer</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>5V 2-Channel Relay Module</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>Button Switch</td>
                    <td>6</td>
                  </tr>
                  <tr>
                    <td>Red LED</td>
                    <td>5</td>
                  </tr>
                  <tr>
                    <td>Yellow LED</td>
                    <td>5</td>
                  </tr>
                  <tr>
                    <td>Green LED</td>
                    <td>5</td>
                  </tr>
                  <tr>
                    <td>RGB LED</td>
                    <td>2</td>
                  </tr>
                  <tr>
                    <td>830 Tie-Point Breadboard</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>F-M DuPont Cable</td>
                    <td>10</td>
                  </tr>
                  <tr>
                    <td>F-F DuPont Cable</td>
                    <td>10</td>
                  </tr>
                  <tr>
                    <td>M-M DuPont Cable</td>
                    <td>10</td>
                  </tr>
                  <tr>
                    <td>Micro-USB Cable</td>
                    <td>1</td>
                  </tr>
                </tbody>
              </table>
            </details>
          </div>

          <div className="min-w-0 flex-1">
            <h3>
              <a href="https://www.alibaba.com/product-detail/Jubaolai-Starter-Kit-for-UNO-R3_1600761988959.html">
                Kit A: Arduino UNO Starter Kit
              </a>
            </h3>
            <details>
              <summary className="cursor-pointer font-bold">Components</summary>
              <table>
                <thead>
                  <tr>
                    <th>Component</th>
                    <th>Qty</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>UNO MEGA328P R3</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>MB-102 Breadboard</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>LCD1602 (blue)</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>LCD1602 I2C Adapter</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>DHT11 Module</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>LM35DZ</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>Thermistor</td>
                    <td>3</td>
                  </tr>
                  <tr>
                    <td>RC522 RFID Module</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>Water Level Module</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>Infrared Transmitter</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>Infrared Receiver</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>Remote Control</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>Remote Control LED Module</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>Resistance 1/6W 220R</td>
                    <td>8</td>
                  </tr>
                  <tr>
                    <td>Resistance 1/6W 1K</td>
                    <td>5</td>
                  </tr>
                  <tr>
                    <td>Resistance 1/6W 10K</td>
                    <td>6</td>
                  </tr>
                  <tr>
                    <td>Potentiometer 5K</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>Passive Buzzer</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>5V Buzzer</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>74HC595N Shift Register</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>HDX Vibration Switch</td>
                    <td>2</td>
                  </tr>
                  <tr>
                    <td>Tact Switch 12x12</td>
                    <td>4</td>
                  </tr>
                  <tr>
                    <td>4x4 Button Module</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>Rocker (5-pin)</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>LED Yellow F5</td>
                    <td>5</td>
                  </tr>
                  <tr>
                    <td>LED Red F5</td>
                    <td>5</td>
                  </tr>
                  <tr>
                    <td>LED Blue F5</td>
                    <td>5</td>
                  </tr>
                  <tr>
                    <td>Dot Matrix Module 8x8</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>ULN2003 Module</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>SG90 Servo</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>Stepper Motor</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>Microphone Module</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>5V 1-Way Relay Module</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>1-Digit Digital Tube</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>4-Digit Digital Tube</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>DS1302 RTC Module</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>Dupont Line 20cm M-F</td>
                    <td>10</td>
                  </tr>
                  <tr>
                    <td>9V Battery Connector</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>USB Cable</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>Breadboard Wires</td>
                    <td>1</td>
                  </tr>
                </tbody>
              </table>
            </details>
          </div>
        </div>

        <blockquote>
          <p>
            Note: Although at first glance the Arduino kit has more, do research
            to see what you need! For instance, ESP32s are more compact, and
            have WiFi and Bluetooth capabilities.
          </p>
        </blockquote>

        <h2>3. Create your design</h2>
        <p>
          Start making your project! Log in and head to the{" "}
          <a href="/platform/projects">platform</a>, hit{" "}
          <strong>New project</strong>, give it a title, and pick your kit. That
          drops you straight into the editor.
        </p>
        <p>
          The editor is a full breadboard workbench in your browser. Drag
          components onto the canvas, wire them up, and write your firmware in
          the built-in code editor. Compile and check your code, then run it in
          the live simulator to watch the circuit work before you touch real
          hardware. You also get a serial monitor, an oscilloscope and logic
          analyzer, virtual sensor controls, a library manager, and one-click
          publishing to GitHub.
        </p>
        <p>
          Everything you do in the editor is timelapsed automatically, but that
          doesn&apos;t replace your journal, you still need to log your progress
          as you go.
        </p>
        <p>
          Do you have other components that aren&apos;t in the platform? You can
          work off platform instead! Design your own custom breadboard in KiCad
          or any tool you like and submit that. Make sure you timelapse{" "}
          <em>everything</em> you do, and journal your progress!{" "}
          <strong>This isn&apos;t recommended</strong>, but it&apos;s an
          available option :D Create your project for more information, and make
          sure to include all the <a href="/requirements">requirements</a>.
        </p>
        <hr />

        <p>
          Got questions? Ask in{" "}
          <a href="https://hackclub.enterprise.slack.com/archives/C09EB0AE68M">
            #breadboard
          </a>{" "}
          on Slack. If you build something this weekend, post it there too!
        </p>
      </ProseCard>
    </section>
  );
}
