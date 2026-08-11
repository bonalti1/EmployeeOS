/**
 * Family growth topics. Beyond fun activities, these are areas Rolando wants to
 * intentionally grow in — as a father, as a husband, and in the principles he
 * passes on. Pick a topic and it surfaces concrete ideas, each with a short
 * "why this matters" so the action connects to the bigger goal. Fully offline;
 * {kid} is swapped for a child's name where it fits.
 */
export type GrowthIdea = { text: string; why: string }
export type GrowthTopic = { id: string; label: string; emoji: string; blurb: string; ideas: GrowthIdea[] }

export const GROWTH_TOPICS: GrowthTopic[] = [
  {
    id: 'father',
    label: 'Great father',
    emoji: '👨‍👧‍👦',
    blurb: 'Show up as the dad they’ll remember.',
    ideas: [
      { text: 'Give {kid} 15 minutes of full attention — phone away, you on the floor with them.', why: 'Undivided presence is how kids feel loved; it builds security more than any gift.' },
      { text: 'Ask {kid} “what was the best and hardest part of your day?” at dinner.', why: 'Teaches them to reflect and shows them their inner world matters to you.' },
      { text: 'Let {kid} help with a real task — cooking, fixing, a work errand.', why: 'Working side by side builds competence and quiet confidence in them.' },
      { text: 'Apologize to {kid} the next time you get it wrong.', why: 'Modeling humility teaches them accountability better than a lecture ever could.' },
      { text: 'Tell {kid} one specific thing you admire about them today.', why: 'Specific praise shapes identity — they become the person you notice out loud.' },
      { text: 'Put yourself on their level physically when they’re upset.', why: 'Calm, eye-level presence regulates their emotions and models steadiness.' },
      { text: 'Create one small ritual just for you two (Friday donuts, Sunday walk).', why: 'Predictable one-on-one time becomes the memories they carry into adulthood.' },
    ],
  },
  {
    id: 'principles',
    label: 'Principles & morals',
    emoji: '🧭',
    blurb: 'The values you want to pass on.',
    ideas: [
      { text: 'Point out honesty when you see it — “I saw you tell the truth even though it was hard.”', why: 'Kids repeat what gets named and noticed; integrity grows when it’s seen.' },
      { text: 'Keep a promise to {kid} you could easily have skipped.', why: 'Your word becomes their definition of trust — they learn it from you first.' },
      { text: 'Do a small act of service together for someone who can’t repay you.', why: 'Generosity is caught, not taught; serving together builds their character.' },
      { text: 'Talk through a tough choice out loud — let them hear how you weigh right vs. easy.', why: 'They inherit your decision-making by watching your reasoning, not just the result.' },
      { text: 'Practice gratitude at dinner — everyone names one thing they’re thankful for.', why: 'Gratitude rewires how they see the world and guards them against entitlement.' },
      { text: 'Hold {kid} to a consequence with warmth, not anger.', why: 'Loving boundaries teach responsibility and that rules come from care, not control.' },
      { text: 'Share a value from your own faith or upbringing and why it still guides you.', why: 'Roots give kids an anchor — they stand firmer when they know what they stand on.' },
    ],
  },
  {
    id: 'teaching',
    label: 'Teaching moments',
    emoji: '📚',
    blurb: 'Skills and lessons for real life.',
    ideas: [
      { text: 'Teach {kid} to handle a little money — save, give, spend in three jars.', why: 'Early money habits become lifelong ones; stewardship starts small.' },
      { text: 'Show {kid} how you do part of your job.', why: 'Seeing a father work hard and with purpose sets their bar for their own future.' },
      { text: 'Cook one recipe together, start to finish.', why: 'Practical skills build independence and give them pride in doing things themselves.' },
      { text: 'Let {kid} fail at something small and coach them through the retry.', why: 'Resilience is learned in safe failures with a steady dad beside them.' },
      { text: 'Read a story and ask what the character should have done.', why: 'Stories are a safe way to practice judgment and empathy before real life tests it.' },
      { text: 'Teach {kid} to greet adults, make eye contact, and say thank you.', why: 'Respect and manners open doors for them their whole life.' },
      { text: 'Fix or build something and narrate your thinking as you go.', why: 'Problem-solving out loud teaches them how to think, not just what to do.' },
    ],
  },
  {
    id: 'marriage',
    label: 'Marriage & wife',
    emoji: '💍',
    blurb: 'A strong marriage is the foundation.',
    ideas: [
      { text: 'Plan a real date night this week — you plan it, not her.', why: 'Pursuing your wife keeps the marriage a relationship, not just a partnership.' },
      { text: 'Send her a text mid-day naming something you appreciate about her.', why: 'Small, consistent appreciation fills the account long before it’s needed.' },
      { text: 'Ask “how can I make your day easier?” and then do it.', why: 'Practical love speaks louder than words and lightens her invisible load.' },
      { text: 'Put your phone down when she’s talking and give full eye contact.', why: 'Feeling truly heard is one of the deepest needs in a marriage.' },
      { text: 'Handle a chore she usually does — without being asked or mentioning it.', why: 'Quiet service says “we’re a team” more than any grand gesture.' },
      { text: 'Let the kids see you speak to and about her with respect and affection.', why: 'Your marriage is the model your kids will use for their own one day.' },
      { text: 'Ask her about her dreams and how you can help her chase one.', why: 'Championing her growth keeps you partners moving forward together, not apart.' },
      { text: 'Pray or reflect together, even for two minutes, before bed.', why: 'A shared spiritual rhythm binds a couple at a level daily life can’t reach.' },
    ],
  },
  {
    id: 'funtime',
    label: 'Family fun',
    emoji: '🎉',
    blurb: 'Something to do together.',
    ideas: [
      { text: 'Family bike ride or walk after dinner.', why: 'Movement together turns ordinary evenings into connection and memories.' },
      { text: 'Build the tallest Lego tower you can with {kid}.', why: 'Play on their terms tells kids they’re worth your time and joy.' },
      { text: 'Family movie night with popcorn and no screens buzzing.', why: 'Shared downtime builds the easy closeness that deep talks later grow from.' },
      { text: 'Cook or bake something together — let {kid} pick.', why: 'Giving kids ownership builds confidence and makes the memory theirs.' },
      { text: 'Backyard game night — soccer, catch, or tag.', why: 'Laughing and competing together bonds the family in a way talking can’t.' },
      { text: 'Nature walk with a small scavenger hunt.', why: 'Curiosity and wonder are grown outdoors, away from the noise of screens.' },
      { text: 'Weekend adventure — a new park, trail, or town you’ve never visited.', why: 'Shared firsts become the stories your family retells for years.' },
    ],
  },
]

/** Pick up to n ideas from a topic, personalized with a kid's name. */
export function pickGrowthIdeas(topicId: string, n: number, kids: string[] = []): GrowthIdea[] {
  const topic = GROWTH_TOPICS.find((t) => t.id === topicId)
  if (!topic) return []
  const pool = [...topic.ideas]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  const nameFor = () => (kids.length ? kids[Math.floor(Math.random() * kids.length)] : 'the kids')
  return pool.slice(0, Math.max(1, n)).map((idea) => ({ ...idea, text: idea.text.replace(/\{kid\}/g, nameFor()) }))
}
