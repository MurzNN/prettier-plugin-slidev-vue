---
title: "Mixed Slidev and Vue formatting"
transition: slide-up
---

# Welcome to the demo

This paragraph has **placeholder** text and shows normal Markdown formatting.

<v-click>
  <div v-if="showMessage" class="rounded-lg bg-blue-500 p-4 text-white">
    <h2 id="greeting" class="mb-2 text-xl font-bold">Hello, {{ name }}!</h2>
    <p>Here is some placeholder content inside a Vue component.</p>
    <button
      class="rounded bg-blue-700 px-4 py-2 text-white"
      type="button"
      @click="showMessage = false"
    >
      Dismiss
    </button>
  </div>
</v-click>

---

# A second slide

<article
  v-if="showCard"
  id="feature-card"
  class="rounded-xl bg-purple-600 p-6 text-white shadow-lg"
>
  <h2 class="mb-3 text-2xl font-bold">A sample feature card</h2>
  <p class="mb-4">
    This nested content has intentionally inconsistent indentation.
  </p>
  <ul class="list-disc pl-6 text-white">
    <li class="mb-2">Placeholder list item one</li>
    <li class="mb-2">Placeholder list item two</li>
  </ul>
  <button
    type="button"
    class="rounded bg-purple-800 px-4 py-2 text-white"
    @click="showCard = false"
  >
    Hide card
  </button>
</article>
