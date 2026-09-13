'use strict';

/**
 * AI Provider Adapter — Phase 4B-5
 *
 * Implements provider abstraction for AI caption generation.
 * Decouples main process / renderer from underlying AI services.
 * Features a deterministic Mock provider for tests/offline usage and
 * an extensible Http provider for live cloud APIs.
 */

const https = require('https');

/**
 * Deterministic Mock AI Provider for testing and offline environments.
 * Generates tailored, high-quality suggestions matching language, tone, length, and platform.
 */
class MockAiProvider {
  constructor(options = {}) {
    this.name = 'mock';
    this.simulatedDelay = options.simulatedDelay || 0;
    this.forceError = options.forceError || null;
    this.forceTimeout = options.forceTimeout || false;
    this.forceMalformed = options.forceMalformed || false;
    this.forceEmpty = options.forceEmpty || false;
    this.forceExcess = options.forceExcess || false;
  }

  async generate(request) {
    if (this.simulatedDelay > 0) {
      await new Promise((r) => setTimeout(r, this.simulatedDelay));
    }

    if (this.forceTimeout) {
      const err = new Error('AI request timed out after 30000ms');
      err.code = 'ETIMEDOUT';
      throw err;
    }

    if (this.forceError) {
      throw new Error(this.forceError);
    }

    if (this.forceMalformed) {
      return { invalidStructure: true, randomField: 123 };
    }

    if (this.forceEmpty) {
      return [];
    }

    const { topic, language, tone, length, platform, count = 3 } = request;

    if (this.forceExcess) {
      return [
        'Caption 1', 'Caption 2', 'Caption 3', 'Caption 4',
        'Caption 5', 'Caption 6', 'Caption 7', 'Caption 8'
      ];
    }

    const isBangla = language === 'bangla';
    const suggestions = [];
    const cleanTopic = topic.slice(0, 40);

    for (let i = 0; i < count; i++) {
      let caption = '';
      if (isBangla) {
        caption = this._generateBanglaCaption(cleanTopic, tone, length, platform, i);
      } else {
        caption = this._generateEnglishCaption(cleanTopic, tone, length, platform, i);
      }
      suggestions.push(caption);
    }

    return suggestions;
  }

  _generateEnglishCaption(topic, tone, length, platform, index) {
    const hooks = {
      professional: [
        `Key Insights on ${topic}`,
        `Strategic Overview: Mastering ${topic}`,
        `Best Practices for ${topic} in 2026`,
        `Executive Summary: The Future of ${topic}`,
        `Proven Framework for ${topic}`,
      ],
      casual: [
        `Wait till you see this ${topic} hack! ✨`,
        `Honestly obsessed with ${topic} right now 🔥`,
        `Nobody is talking about this ${topic} trick 👀`,
        `Quick reminder about ${topic} today! 💡`,
        `The easiest way to level up your ${topic} 🚀`,
      ],
      educational: [
        `Did you know this about ${topic}?`,
        `Pro Tip: The fundamental rule of ${topic}`,
        `3 Critical Things to Learn About ${topic}`,
        `How ${topic} actually works behind the scenes`,
        `Step-by-step breakdown of ${topic}`,
      ],
      promotional: [
        `Unlock the full power of ${topic} today!`,
        `Special Announcement: Transform your ${topic}`,
        `Don't miss out on these ${topic} secrets!`,
        `Get the most out of your ${topic} now`,
        `Level up your ${topic} with this exclusive guide!`,
      ],
      storytelling: [
        `The unexpected lesson I learned from ${topic}...`,
        `It all changed when I discovered ${topic}...`,
        `Behind the scenes of our journey with ${topic}`,
        `Why everyone told me ${topic} was impossible`,
        `The turning point: What ${topic} taught us`,
      ],
    };

    const selectedHooks = hooks[tone] || hooks.casual;
    const hook = selectedHooks[index % selectedHooks.length];

    if (length === 'short') {
      return hook;
    }

    const bodies = {
      professional: 'Consistently applying these principles drives measurable performance and long-term results.',
      casual: 'Save this video right now so you don’t lose it later!',
      educational: 'Understand the basics first, then build your workflow systematically.',
      promotional: 'Tap the link to explore our complete tools and take action today!',
      storytelling: 'Sometimes the smallest adjustment leads to the biggest transformation in your journey.',
    };
    const body = bodies[tone] || bodies.casual;

    if (length === 'medium') {
      return `${hook}\n${body}`;
    }

    // Long
    const ctas = {
      facebook: 'Share your thoughts in the comments below!',
      instagram: 'Save & share with someone who needs this!',
      tiktok: 'Follow for daily updates and tips!',
      youtube: 'Subscribe and hit the bell for more in-depth breakdowns!',
      other: 'Leave a comment and let us know what you think!',
    };
    const cta = ctas[platform] || ctas.other;

    return `${hook}\n${body}\n${cta}`;
  }

  _generateBanglaCaption(topic, tone, length, platform, index) {
    const hooks = {
      professional: [
        `${topic}: পেশাদার দৃষ্টিভঙ্গি ও সঠিক কৌশল`,
        `${topic} পরিচালনার সেরা কার্যপদ্ধতি`,
        `${topic} নিয়ে গুরুত্বপূর্ণ বিশ্লেষণ`,
        `${topic} ক্ষেত্রে সফল হওয়ার মূল দিকগুলো`,
        `${topic}: কার্যকর পরিকল্পনা ও দিকনির্দেশনা`,
      ],
      casual: [
        `${topic} নিয়ে এই চমকপ্রদ তথ্য জানতেন কি? ✨`,
        `${topic} এখন আগের চেয়ে অনেক সহজ! 🔥`,
        `সবাইকে তাক লাগিয়ে দিন ${topic} দিয়ে! 👀`,
        `${topic} নিয়ে দুর্দান্ত কিছু টিপস! 💡`,
        `${topic} করার সবচেয়ে সহজ নিয়ম 🚀`,
      ],
      educational: [
        `${topic} শেখার সহজ উপায় ও নিয়মাবলী`,
        `${topic} সম্পর্কে যা আপনার অবশ্যই জানা উচিত`,
        `${topic} নিয়ে ৩টি প্রয়োজনীয় বিষয় জেনে নিন`,
        `${topic} কীভাবে সঠিকভাবে কাজ করে?`,
        `${topic} সম্পর্কিত সাধারণ ভুল ও তার সমাধান`,
      ],
      promotional: [
        `${topic} নিয়ে বিশেষ সুযোগ গ্রহণ করুন আজই!`,
        `${topic} শুরু করার এখনই সেরা সময়!`,
        `${topic} নিয়ে সীমিত সময়ের জন্য বিশেষ বার্তা!`,
        `${topic} উন্নত করুন আর এগিয়ে থাকুন সবসময়!`,
        `${topic} নিয়ে এখনই আপনার প্রস্তুতি শুরু করুন!`,
      ],
      storytelling: [
        `${topic} যেভাবে সবকিছু বদলে দিয়েছিল...`,
        `${topic} নিয়ে আমাদের বাস্তব অভিজ্ঞতার গল্প`,
        `প্রথম যখন ${topic} শুরু করেছিলাম, যা ঘটেছিল`,
        `${topic} থেকে শেখা আমার জীবনের বড় শিক্ষা`,
        `${topic} এর অজানা পেছনের গল্প`,
      ],
    };

    const selectedHooks = hooks[tone] || hooks.casual;
    const hook = selectedHooks[index % selectedHooks.length];

    if (length === 'short') {
      return hook;
    }

    const bodies = {
      professional: 'সঠিক নিয়ম ও ধারাবাহিকতা বজায় রাখলে কাঙ্ক্ষিত ফলাফল অর্জন সম্ভব।',
      casual: 'ভিডিওটি সেভ করে রাখুন যাতে পরে ভুলে না যান!',
      educational: 'মৌলিক ধারণা পরিষ্কার থাকলে যে কোনো কাজ সহজে সম্পন্ন করা যায়।',
      promotional: 'দেরি না করে আজই শুরু করুন আর নিজেকে এক ধাপ এগিয়ে রাখুন!',
      storytelling: 'ছোট ছোট প্রচেষ্টাই একদিন বড় সাফল্যের রূপ নেয়।',
    };
    const body = bodies[tone] || bodies.casual;

    if (length === 'medium') {
      return `${hook}\n${body}`;
    }

    const ctas = {
      facebook: 'আপনার মতামত কমেন্টে জানান এবং বন্ধুদের সাথে শেয়ার করুন!',
      instagram: 'ভিডিওটি ভালো লাগলে লাইক ও সেভ করে রাখুন!',
      tiktok: 'আরও এমন ভিডিও দেখতে ফলো দিয়ে পাশে থাকুন!',
      youtube: 'নতুন ভিডিওর জন্য চ্যানেলটি সাবস্ক্রাইব করে রাখুন!',
      other: 'মন্তব্যে আপনার মূল্যবান অভিজ্ঞতা শেয়ার করুন!',
    };
    const cta = ctas[platform] || ctas.other;

    return `${hook}\n${body}\n${cta}`;
  }
}

/**
 * Live HTTP AI Provider Adapter.
 * Uses configured environment secrets (e.g. REEL_CUTTER_AI_KEY or OPENAI_API_KEY).
 * Never exposes credentials to renderer.
 */
class HttpAiProvider {
  constructor(options = {}) {
    this.name = 'http';
    this.apiKey = options.apiKey || process.env.REEL_CUTTER_AI_KEY || process.env.OPENAI_API_KEY || null;
    this.endpoint = options.endpoint || process.env.REEL_CUTTER_AI_ENDPOINT || 'https://api.openai.com/v1/chat/completions';
    this.timeoutMs = options.timeoutMs || 30000;
  }

  isConfigured() {
    return Boolean(this.apiKey && typeof this.apiKey === 'string' && this.apiKey.trim().length > 0);
  }

  async generate(request) {
    if (!this.isConfigured()) {
      const err = new Error('AI Caption Generator is not configured. An API key is required in settings or environment.');
      err.code = 'NO_API_KEY';
      throw err;
    }

    const { topic, language, tone, length, platform, count = 3 } = request;

    const systemPrompt = `You are a professional social media video copywriter and caption generator.
Generate exactly ${count} distinct, engaging caption suggestions for short-form video content (Reels/Shorts/TikTok).
Language: ${language}.
Tone: ${tone}.
Length: ${length}.
Platform target: ${platform || 'general'}.
Return ONLY a valid JSON array of strings, for example: ["Caption 1", "Caption 2", "Caption 3"].
Do NOT output markdown fences, HTML, or explanations.`;

    const userPrompt = `Topic: "${topic}". Generate ${count} captions.`;

    const requestPayload = JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 600,
    });

    const parsedUrl = new URL(this.endpoint);

    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || 443,
          path: parsedUrl.pathname + parsedUrl.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(requestPayload),
            Authorization: `Bearer ${this.apiKey}`,
          },
          timeout: this.timeoutMs,
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
              return reject(new Error(`AI provider responded with HTTP status ${res.statusCode}: ${body.slice(0, 200)}`));
            }
            try {
              const data = JSON.parse(body);
              const textContent = data.choices?.[0]?.message?.content?.trim() || '';
              // Parse JSON array from content
              const cleanedText = textContent.replace(/^```json\s*|^```\s*|```$/gi, '').trim();
              const parsedArray = JSON.parse(cleanedText);
              if (!Array.isArray(parsedArray)) {
                return reject(new Error('AI provider did not return a JSON array'));
              }
              resolve(parsedArray);
            } catch (err) {
              reject(new Error(`Failed to parse AI response: ${err.message}`));
            }
          });
        }
      );

      req.on('timeout', () => {
        req.destroy();
        const err = new Error(`AI request timed out after ${this.timeoutMs}ms`);
        err.code = 'ETIMEDOUT';
        reject(err);
      });

      req.on('error', (err) => {
        reject(new Error(`Network error contacting AI service: ${err.message}`));
      });

      req.write(requestPayload);
      req.end();
    });
  }
}

// ── Provider Registry ────────────────────────────────────────────────────────

let activeProvider = new MockAiProvider();

function getActiveProvider() {
  return activeProvider;
}

function setActiveProvider(provider) {
  if (!provider || typeof provider.generate !== 'function') {
    throw new Error('Provider must implement a generate() method');
  }
  activeProvider = provider;
}

function resetToDefaultProvider() {
  // If API key is present in environment, use Http provider, otherwise Mock provider
  if (process.env.REEL_CUTTER_AI_KEY || process.env.OPENAI_API_KEY) {
    activeProvider = new HttpAiProvider();
  } else {
    activeProvider = new MockAiProvider();
  }
  return activeProvider;
}

module.exports = {
  MockAiProvider,
  HttpAiProvider,
  getActiveProvider,
  setActiveProvider,
  resetToDefaultProvider,
};
