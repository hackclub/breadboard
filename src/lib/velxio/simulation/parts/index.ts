// @ts-nocheck
export * from "@/lib/velxio/simulation/parts/PartSimulationRegistry";
export * from "@/lib/velxio/simulation/parts/ActiveParts";
// Side-effect imports — each of these files registers entries into the
// PartSimulationRegistry on module load. ActiveParts must run too so that
// semiconductors are marked self-managed (see the file header for why).
import "@/lib/velxio/simulation/parts/ActiveParts";
import "@/lib/velxio/simulation/parts/BasicParts";
import "@/lib/velxio/simulation/parts/ComplexParts";
import "@/lib/velxio/simulation/parts/ChipParts";
import "@/lib/velxio/simulation/parts/SensorParts";
import "@/lib/velxio/simulation/parts/MotorDriverParts";
import "@/lib/velxio/simulation/parts/LogicGateParts";
import "@/lib/velxio/simulation/parts/ProtocolParts";
import "@/lib/velxio/simulation/parts/CustomChipPart";
import "@/lib/velxio/simulation/parts/EPaperPart";
