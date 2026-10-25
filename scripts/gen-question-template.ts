// Regenerates docs/question-template.csv from a few of the built-in questions.
import fs from "node:fs";
import { questionsToCsv } from "../src/lib/questionCsv";
import { FILL_BLANK, MATCHING, MULTIPLE_CHOICE, SHORT_ANSWER } from "../src/lib/seed/economics-review";

const pick = [MATCHING[0], MATCHING[2], FILL_BLANK[1], FILL_BLANK[7], MULTIPLE_CHOICE[0], MULTIPLE_CHOICE[8], SHORT_ANSWER[1]];
fs.writeFileSync("docs/question-template.csv", questionsToCsv(pick.map((q) => ({ ...q, type: q.data.type, unit: "Markets, Circular Flow & Supply/Demand" }))));
console.log("wrote docs/question-template.csv");
