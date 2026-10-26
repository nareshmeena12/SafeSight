import { redirect } from "next/navigation";

/** Short address for the classroom screen: /quiz → the student's join page (login first if needed). */
export default function QuizShortcut() {
  redirect("/student/quiz");
}
