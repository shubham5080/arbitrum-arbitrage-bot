import fs from "fs";

export function logOpportunity(opportunity: any) {
  fs.appendFileSync(
    "logs/opportunities.log",
    JSON.stringify(opportunity) + "\n"
  );
}
