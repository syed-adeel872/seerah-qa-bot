# STRICT AI AGENT RULES - SEERAH CONTENT BOT

**CRITICAL INSTRUCTION FOR AI AGENT:** 
Before writing any code or making any structural changes, you MUST read and cross-reference the project requirements file named exactly "Developers, AI Engineer Brief.pdf". You must strictly adhere to the following rules at all times. Do not invent features or deviate from these core rules.

## 1. Core Objective
* Build a conversational Q&A bot grounded ONLY in the fixed corpus (Shamail 120 entries + named course content)[cite: 1].
* Every answer must cite its source entry[cite: 1].

## 2. Mandatory Deliverables & Bot Behavior
The working prototype must perfectly demonstrate the following logic flows:
* **In-corpus questions:** Provide the answer with a citation[cite: 1].
* **Out-of-corpus questions:** The bot must redirect the user or use a safe fallback[cite: 1].
* **Ruling / fatwa-style questions:** The bot must refuse to answer and redirect to an alim[cite: 1].
* **Disclaimer:** A persistent disclaimer must be always visible in the UI[cite: 1].

## 3. Platform Selection
* The codebase must target ONE chosen platform from the following options: In-app chat widget (Seerah Q&A inside the Seerah app), WhatsApp bot (Seerah Q&A on WhatsApp), or Web chat (Seerah Q&A on a website chat)[cite: 1]. 

## 4. Corpus API Integration
You must ONLY use the provided Corpus APIs with the base URL `/api/seerathon/corpus`[cite: 1]. 
* **Answer Corpus:** Ensure the bot only uses Shamail and Timeline endpoints for generating answers[cite: 1]. 
* **Reference Index:** Use the Courses endpoint only as an index/reference[cite: 1].
* Available endpoints include `/meta`, `/shamail`, `/shamail/:id`, `/timeline`, `/timeline/:id`, and `/courses`[cite: 1].
* Supported query parameters: `page`, `limit (max 120)`, `q`, `category_id` (Shamail only), `section` (Timeline only), and `include_hikayat=true` (Shamail only)[cite: 1].

## 5. UI/UX & Designer Notes
If working on the frontend/UI, strictly follow these visual rules:
* **Visual Language:** Use a chat UI with a soft AI glow, completely avoiding sci-fi excess[cite: 1].
* **Citations:** You must show citation chips or source cards in the UI mockups[cite: 1].
* **Badges:** Include platform badges indicating In-App, WhatsApp, or Web[cite: 1].
* **Messaging:** Prioritize trust-first messaging over "cool AI" hype[cite: 1].

## 6. The "4 NOs" (Core Rules to Double-Check)
1. Bot answers ONLY from approved Shamail + course corpus[cite: 1].
2. NO free-form religious rulings allowed[cite: 1].
3. ALWAYS cite the source[cite: 1].
4. ALWAYS show the disclaimer[cite: 1].