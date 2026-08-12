/**
 * The mentor panel — marketing greats the AI writes through. Each is a *lens*:
 * their public frameworks and taste applied to the draft (never a claim that
 * they endorse anything). `why` is shown in the app; `style` steers the model.
 */

export type Mentor = {
  id: string
  name: string
  why: string     // one line shown under the chip
  style: string   // instructions handed to the model
}

export const MENTORS: Mentor[] = [
  {
    id: 'hormozi',
    name: 'Alex Hormozi',
    why: 'The offer — makes the value so obvious that saying no feels stupid',
    style: 'Apply Alex Hormozi\'s playbook: lead with a Grand Slam Offer. Stack tangible value, name the dream outcome, crush perceived risk (guarantees, proof), compress time-to-result, and speak in blunt, numbers-heavy plain English. No fluff, no adjectives without evidence.',
  },
  {
    id: 'godin',
    name: 'Seth Godin',
    why: 'Remarkability — if it is not worth talking about, do not make it',
    style: 'Apply Seth Godin\'s thinking: find the purple cow. Make the piece remarkable enough that the smallest viable audience retells it. Short sentences. A generous, human tone. Position against the boring default in the market rather than against a competitor.',
  },
  {
    id: 'jobs',
    name: 'Steve Jobs',
    why: 'Simplicity — one idea, said beautifully',
    style: 'Apply Steve Jobs\' approach: ruthless simplicity. One single idea per piece, expressed with elegance and drama ("1,000 songs in your pocket"). Cut every feature list down to the one benefit that changes the customer\'s life. Build a moment of reveal.',
  },
  {
    id: 'ogilvy',
    name: 'David Ogilvy',
    why: 'Headlines & proof — the father of ads that actually sell',
    style: 'Apply David Ogilvy\'s discipline: the headline is 80% of the ad — write it like the reader\'s money depends on it. Be specific, factual and respectful of the customer\'s intelligence. Use proof, numbers and long-copy persuasion where it earns its place.',
  },
  {
    id: 'schwartz',
    name: 'Eugene Schwartz',
    why: 'Awareness — meets the buyer exactly where their mind already is',
    style: 'Apply Eugene Schwartz\'s Breakthrough Advertising: identify the market\'s stage of awareness (unaware → most aware) and enter the conversation already happening in the prospect\'s head. Channel existing desire onto the product rather than trying to create desire.',
  },
  {
    id: 'halbert',
    name: 'Gary Halbert',
    why: 'Hooks — find the starving crowd, then speak straight to it',
    style: 'Apply Gary Halbert\'s style: find the starving crowd and the single strongest emotional hook. Write like a letter from one person to one person — conversational, urgent, story-first, with an itch that only the CTA scratches.',
  },
  {
    id: 'musk',
    name: 'Elon Musk',
    why: 'First principles — contrarian framing people cannot help but share',
    style: 'Apply Elon Musk\'s communication style: first-principles framing that makes the conventional way look absurd, bold claims stated flatly, a little humor and memeability. Say the quiet part out loud; let the audacity do the marketing.',
  },
  {
    id: 'mrbeast',
    name: 'MrBeast',
    why: 'Retention — every second must earn the next second',
    style: 'Apply MrBeast\'s video philosophy: the first 3 seconds state the payoff, stakes escalate constantly, no dead air, visual pattern-interrupts every few seconds, and the title/thumbnail concept is designed before the script. Re-hook the viewer at every potential drop-off.',
  },
]

export const mentorById = (id: string) => MENTORS.find((m) => m.id === id)
