import { useEffect, useState } from "react";

type Phase = "typing" | "pause" | "deleting";

// Types out words[0] on mount, then loops through the rest of the list by
// backspacing the current word and typing the next one, indefinitely.
export function useTypewriterCycle(
  words: string[],
  options?: { typeSpeed?: number; deleteSpeed?: number; pauseMs?: number; cursorBlinkMs?: number },
) {
  const { typeSpeed = 45, deleteSpeed = 35, pauseMs = 1400, cursorBlinkMs = 500 } = options ?? {};
  const [wordIndex, setWordIndex] = useState(0);
  const [chars, setChars] = useState(0);
  const [phase, setPhase] = useState<Phase>("typing");
  const [cursorOn, setCursorOn] = useState(true);

  useEffect(() => {
    const word = words[wordIndex];

    if (phase === "typing") {
      if (chars < word.length) {
        const timer = setTimeout(() => setChars((c) => c + 1), typeSpeed);
        return () => clearTimeout(timer);
      }
      setPhase("pause");
      return;
    }

    if (phase === "pause") {
      const timer = setTimeout(() => setPhase("deleting"), pauseMs);
      return () => clearTimeout(timer);
    }

    // phase === "deleting"
    if (chars > 0) {
      const timer = setTimeout(() => setChars((c) => c - 1), deleteSpeed);
      return () => clearTimeout(timer);
    }
    setWordIndex((i) => (i + 1) % words.length);
    setPhase("typing");
  }, [phase, chars, wordIndex, words, typeSpeed, deleteSpeed, pauseMs]);

  useEffect(() => {
    const blink = setInterval(() => setCursorOn((v) => !v), cursorBlinkMs);
    return () => clearInterval(blink);
  }, [cursorBlinkMs]);

  return { text: words[wordIndex].slice(0, chars), cursorOn };
}
