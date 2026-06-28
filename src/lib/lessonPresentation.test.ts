import { describe, expect, it } from "vitest";
import { generateCourseDeck, generateLessonSlides } from "./lessonPresentation";

const lesson = {
  id: "lesson-1",
  slug: "knn",
  title: "KNN Algorithm",
  summary: "KNN classifies data using nearby examples.",
  unit: 2,
  order_index: 0,
  content: [
    { type: "text", value: "KNN is a supervised learning algorithm. It compares a new point with its nearest neighbors. The majority class becomes the prediction." },
    { type: "flowchart", title: "How KNN works", steps: ["Choose K", "Measure distance", "Find neighbors", "Vote"] },
    { type: "table", title: "Strengths and limits", headers: ["Strength", "Limitation"], rows: [["Simple", "Slower on large data"]] },
    { type: "timeline", title: "Model workflow", items: [{ label: "First", desc: "Prepare data" }, { label: "Then", desc: "Predict" }] },
  ],
};

describe("lesson presentation generation", () => {
  it("turns structured lesson blocks into focused presentation layouts", () => {
    const slides = generateLessonSlides(lesson);

    expect(slides[0]).toMatchObject({ title: "KNN Algorithm", layout: "title" });
    expect(slides.some((slide) => slide.layout === "bullets")).toBe(true);
    expect(slides.some((slide) => slide.layout === "process")).toBe(true);
    expect(slides.some((slide) => slide.layout === "comparison")).toBe(true);
    expect(slides.some((slide) => slide.layout === "timeline")).toBe(true);
    expect(slides.every((slide) => slide.narration.trim().length > 0)).toBe(true);
  });

  it("creates a course intro and keeps lesson navigation metadata", () => {
    const deck = generateCourseDeck({ id: "course-1", title: "Machine Learning", description: "Learn practical models." }, [lesson]);

    expect(deck[0]).toMatchObject({ id: "course-course-1", layout: "title" });
    expect(deck[1].topicSlug).toBe("knn");
    expect(new Set(deck.map((slide) => slide.id)).size).toBe(deck.length);
  });

  it("limits dense prose and lists to readable slide sizes", () => {
    const slides = generateLessonSlides({
      ...lesson,
      content: [{ type: "list", title: "Many ideas", items: Array.from({ length: 13 }, (_, index) => `Idea ${index + 1}`) }],
    });

    expect(slides.slice(1)).toHaveLength(3);
    expect(Math.max(...slides.slice(1).map((slide) => slide.bullets.length))).toBeLessThanOrEqual(6);
  });
});
