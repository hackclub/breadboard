import { PageHero } from "@/components/shared/docs-frame";
import { TeamCard, type TeamMember } from "@/components/marketing/team-card";

export const metadata = {
  title: "Team",
  description: "The people building Breadboard.",
};

const team: TeamMember[] = [
  {
    name: "Tanishq Goyal",
    title: "Lead Organizer",
    description: (
      <>
        Tanishq Goyal is a 15-year-old from New Jersey who joined Hack Club
        during{" "}
        <a
          href="http://highway.hackclub.com/"
          target="_blank"
          rel="noreferrer noopener"
          className="font-semibold text-[#BD0F32] underline"
        >
          Highway
        </a>
        , where he fell in love with engineering. He's now an intern at Hack
        Club, part of the Special Activities Department, and he organized{" "}
        <a
          href="https://fallout.hackclub.com/"
          target="_blank"
          rel="noreferrer noopener"
          className="font-semibold text-[#BD0F32] underline"
        >
          Fallout
        </a>
        . He was also part of the Blueprint team, where he helped lead the
        review team. Outside of code, he loves to fence, hike, snowboard, bike,
        and is a chess fan! He'll happily take you on for a game when you meet.
      </>
    ),
    avatar:
      "https://cdn.hackclub.com/019f200a-a888-714d-ab07-7975d2adb5fd/frame_1.png",
    socials: {
      github: "https://github.com/",
      linkedin: "https://www.linkedin.com/in/goyal-t/",
      slack: "https://hackclub.enterprise.slack.com/team/U08R4Q9H8EB",
      email: "tanishq@hackclub.com",
    },
  },
  {
    name: "Tom",
    title: "Organizer",
    avatar:
      "https://cdn.hackclub.com/019f2034-e041-72a5-977c-b59315f325a3/e09v59wqy1e-u078ph0gbeh-45ae21288c13-512.png",
    socials: {
      github: "https://github.com/deployor/",
    },
  },
];

export default function TeamPage() {
  return (
    <section>
      <PageHero title="Meet the Team">
        <p className="mt-2 text-base text-black/80">
          The people building Breadboard.
        </p>
        <p className="mt-2 text-base text-black/60">
          Want to help out? Say hi in{" "}
          <a
            href="https://hackclub.enterprise.slack.com/archives/C09EB0AE68M"
            className="underline"
          >
            #breadboard
          </a>
          .
        </p>
      </PageHero>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {team.map((member) => (
          <TeamCard key={member.name} member={member} />
        ))}
      </div>
    </section>
  );
}
