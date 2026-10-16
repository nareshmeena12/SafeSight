import StarterKit from "@tiptap/starter-kit";
import { PasteMark } from "./paste-mark";

/** The Trace document schema, shared by the editor and the read-only views. */
export const traceExtensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    link: false,
    underline: false,
    horizontalRule: false,
  }),
  PasteMark,
];
