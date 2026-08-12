export interface Sample {
  label: string;
  question: string;
  lang: "en" | "ur";
}

export const SAMPLE_QUESTIONS: Sample[] = [
  { label: "How patient was the Prophet ﷺ?", question: "How patient was the Prophet ﷺ?", lang: "en" },
  { label: "When was the Prophet ﷺ born?", question: "When was the Prophet ﷺ born?", lang: "en" },
  { label: "What happened at the Battle of Badr?", question: "What happened at the Battle of Badr?", lang: "en" },
  { label: "The Prophet ﷺ's patience (اردو)", question: "نبی ﷺ کا صبر کیسا تھا؟", lang: "ur" },
  { label: "Did the Prophet ﷺ ever take revenge?", question: "Did the Prophet ﷺ ever personally take revenge?", lang: "en" },
  { label: "Is smoking permissible in Islam?", question: "Is smoking permissible in Islam?", lang: "en" },
];