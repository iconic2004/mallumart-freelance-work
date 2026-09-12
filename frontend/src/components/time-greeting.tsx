"use client";

import { useEffect } from "react";

function getGreeting(hour: number) {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 21) return "Good evening";
  return "Good night";
}

export default function TimeGreeting() {
  useEffect(() => {
    const updateGreeting = () => {
      const heading = document.querySelector("h1");
      if (!heading || !heading.textContent?.startsWith("Good")) return;
      const nextGreeting = getGreeting(new Date().getHours());
      heading.textContent = heading.textContent.replace(/^Good (morning|afternoon|evening|night)/, nextGreeting);
    };

    updateGreeting();
    const interval = window.setInterval(updateGreeting, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  return null;
}
