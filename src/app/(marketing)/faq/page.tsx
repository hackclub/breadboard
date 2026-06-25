import { PageHero, ProseCard } from "@/components/shared/docs-frame";

export default function FaqPage() {
  return (
    <section>
      <PageHero title="FAQ">
        <p className="mt-2 text-base text-black/80">
          Answers to common Breadboard questions.
        </p>
        <p className="mt-2 text-base text-black/60">
          Questions? DM{" "}
          <a
            href="https://hackclub.enterprise.slack.com/team/U08R4Q9H8EB"
            className="underline"
          >
            @Tanuki
          </a>{" "}
          or email{" "}
          <a href="mailto:tanishqgoyal590@gmail.com" className="underline">
            tanishqgoyal590@gmail.com
          </a>
        </p>
      </PageHero>

      <ProseCard>
        <p>
          Welcome to the FAQ! This page attempts to point you to the right place
          when you have a question. It&apos;ll be constantly updated throughout
          the event as more questions get asked! As always, if anything is
          unclear, ask in{" "}
          <a href="https://hackclub.enterprise.slack.com/archives/C09EB0AE68M">
            #breadboard
          </a>{" "}
          for help!
        </p>

        <h2>What is this all about?</h2>
        <p>
          Breadboard is a YSWS (You Ship, We Ship) program run by Hack Club, a
          global community of high school hackers.
        </p>
        <p>
          Your goal is to build something real on a breadboard. This includes the <strong> design and build phase! </strong> Ship it, and
          we&apos;ll ship you a component kit to keep building with.
        </p>

        <h2>Where do I get started?</h2>
        <p>
          Check out our{" "}
          <a href="/get-started">getting started doc</a>, which walks you
          through what a valid project looks like, links to a sample project so
          you can see the general direction, and includes tutorials and
          component references to help you along the way. Our Hack Club Slack{" "}
          <a href="https://hackclub.enterprise.slack.com/archives/C09EB0AE68M">
            channel
          </a>{" "}
          is where you can ask questions, share progress, and get feedback.
        </p>

        <h2>But I&apos;m a beginner and don&apos;t know hardware</h2>
        <p>
          No problem! <strong>This YSWS is focused towards beginners.</strong>{" "}
          The getting started doc and tutorials are designed to help you build
          your first circuit even if you&apos;ve never touched a breadboard
          before. The kit has everything you need!
        </p>

        <h2>What do I need to submit?</h2>
        <p>A valid Breadboard submission has two parts:</p>
        <ol>
          <li>
            <strong>A design submission</strong>: a complete, fully
            replicatable project plan. This includes the README, wiring
            diagram, and firmware.
          </li>
        </ol>
        <p>After you receive your breadboard, you will have to submit:</p>
        <ol start={2}>
          <li>
            <strong>A build submission</strong>: photos, a demo video, and a
            build log showing your finished circuit actually working
          </li>
        </ol>
        <p>
          See the <a href="/requirements">full requirements</a> for exactly
          what each stage needs.
        </p>

        <h2>What will I get?</h2>
        <p>You&apos;ll choose one of two component kits:</p>

        <div className="flex flex-col gap-8 lg:flex-row lg:gap-8">
          <div className="min-w-0 flex-1">
            <h3>
              <a href="https://www.alibaba.com/product-detail/Basic-Starter-Kit-for-ESP32-ESP_1601458696838.html">
                Kit B: ESP32 Starter Kit
              </a>
            </h3>
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
                  <td>0.96&quot; OLED Display</td>
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
          </div>

          <div className="min-w-0 flex-1">
            <h3>
              <a href="https://www.alibaba.com/product-detail/Jubaolai-Starter-Kit-for-UNO-R3_1600761988959.html">
                Kit A: Arduino UNO Starter Kit
              </a>
            </h3>
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
          </div>
        </div>

        <blockquote>
          <p>
            Note: Although at first glance the Arduino kit has more, do research
            to see what you need! For instance, ESP32s are more compact, and
            have WiFi and Bluetooth capabilities.
          </p>
        </blockquote>

        <p>
          After your first ship, there will be a shop where you can submit more
          projects and redeem additional kits and components.
        </p>

        <h2>Who runs this?</h2>
        <p>
          This is organized by Hack Club, a 501(c)(3) nonprofit that supports a
          global community of 105,892 and counting high school makers.
        </p>
      </ProseCard>
    </section>
  );
}
