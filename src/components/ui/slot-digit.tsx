"use client";

import { useEffect, useRef, useState } from "react";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

interface SlotDigitProps {
  digit: number;
  delay: number;
}

export function SlotDigit({ digit, delay }: SlotDigitProps) {
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <span
      className="inline-block overflow-hidden align-bottom"
      style={{ height: "1em", lineHeight: "1em" }}
    >
      <span
        ref={ref}
        className="inline-flex flex-col"
        style={{
          transform: `translateY(${mounted ? -digit * 10 : 0}%)`,
          transition: mounted
            ? `transform 600ms cubic-bezier(0.23, 1, 0.32, 1) ${delay}ms`
            : "none",
        }}
      >
        {DIGITS.map((d) => (
          <span
            key={d}
            className="inline-block text-center"
            style={{ height: "1em", lineHeight: "1em" }}
            aria-hidden={d !== String(digit)}
          >
            {d}
          </span>
        ))}
      </span>
    </span>
  );
}

interface SlotNumberProps {
  value: string;
  className?: string;
}

export function SlotNumber({ value, className }: SlotNumberProps) {
  const prevValue = useRef(value);
  const [displayChars, setDisplayChars] = useState(() => splitChars(value));

  useEffect(() => {
    if (value !== prevValue.current) {
      setDisplayChars(splitChars(value));
      prevValue.current = value;
    }
  }, [value]);

  return (
    <span className={className} aria-label={value}>
      {displayChars.map((char, i) => {
        const digitVal = parseInt(char, 10);
        if (!isNaN(digitVal)) {
          return <SlotDigit key={`d-${i}`} digit={digitVal} delay={i * 40} />;
        }
        return (
          <span key={`s-${i}`} className="inline-block">
            {char}
          </span>
        );
      })}
    </span>
  );
}

function splitChars(value: string): string[] {
  return value.split("");
}
