---
title:    "Mixed Slidev and Vue formatting"
transition:    slide-up
---

#   Welcome to the demo

This   paragraph has **placeholder** text and shows normal Markdown formatting.

<v-click>

<div
v-if="showMessage"
class="text-white p-4 bg-blue-500 rounded-lg"
>
<h2 class="text-xl font-bold mb-2" id="greeting">Hello, {{ name }}!</h2>
<p>Here is some placeholder content inside a Vue component.</p>
<button
@click="showMessage = false"
class="text-white px-4 py-2 bg-blue-700 rounded"
type="button"
>
Dismiss
</button>
</div>

</v-click>

---

#   A second slide

<article
class="text-white p-6 bg-purple-600 rounded-xl shadow-lg"
id="feature-card"
v-if="showCard"
>
<h2 class="text-2xl font-bold mb-3">A sample feature card</h2>
<p class="mb-4">This nested content has intentionally inconsistent indentation.</p>
<ul class="pl-6 list-disc text-white">
<li class="mb-2">Placeholder list item one</li>
<li class="mb-2">Placeholder list item two</li>
</ul>
<button
type="button"
@click="showCard = false"
class="text-white px-4 py-2 bg-purple-800 rounded"
>
Hide card
</button>
</article>
