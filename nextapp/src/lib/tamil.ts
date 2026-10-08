/* Tamil / Tanglish search aliases — customers search the way they speak.
   Ported 1:1 from public/js/home.js so vanilla and React search behave identically. */
export const TAMIL_ALIASES: Record<string, string[]> = {
    "tomato": ["thakkali", "takkali", "தக்காளி"], "cherry-tomatoes": ["thakkali"], "heirloom-tomatoes": ["thakkali"],
    "vine-tomatoes-1-kg": ["thakkali"], "vine-tomatoes-2-kg": ["thakkali"], "vine-tomatoes-500-g": ["thakkali"],
    "green-chilli": ["pachai milagai", "milagai", "பச்சை மிளகாய்"], "red-chilli-fresh": ["semmilagai", "sigappu milagai"],
    "birds-eye-chilli": ["kanthari", "kanthari milagai"],
    "brinjal-eggplant": ["kathirikkai", "kathrikai", "kattrikkai", "கத்தரிக்காய்"], "brinjal-japanese": ["kathirikkai"], "brinjal-thai": ["kathirikkai"],
    "capsicum-green": ["koda milagai", "கோதா மிளகாய்"], "capsicum-red": ["koda milagai"], "capsicum-yellow": ["koda milagai"],
    "tri-colour-bell-peppers-1-kg": ["koda milagai"], "tri-colour-bell-peppers-500-g": ["koda milagai"], "tri-colour-bell-peppers-250-g": ["koda milagai"],
    "onion-big": ["vengayam", "periya vengayam", "வெங்காயம்"],
    "small-onion-shallot": ["chinna vengayam", "chinna ulli", "small onion", "சின்ன வெங்காயம்"],
    "garlic": ["poondu", "vellapoondu", "பூண்டு"],
    "spring-onion-scallion": ["vengaya thal", "spring onion"], "chives": ["vengaya thal"],
    "potato": ["urulai kilangu", "urulaikilangu", "உருளைக்கிழங்கு"],
    "carrot-ooty": ["carrot", "கேரட்"], "orange-carrots-1-kg": ["carrot"], "orange-carrots-500-g": ["carrot"], "purple-carrot": ["carrot"],
    "radish-red": ["mullangi", "mullangai", "முள்ளங்கி"], "radish-white": ["mullangi"],
    "sweet-potato": ["sakkarai valli kilangu", "sarkarai valli", "சக்கரைவள்ளிக்கிழங்கு"],
    "tapioca-cassava": ["maravalli kilangu", "kappa", "மரவள்ளிக்கிழங்கு"],
    "elephant-foot-yam-suran": ["karunai kilangu", "suran", "சுரைக்கிழங்கு"], "yam": ["karunai kilangu", "senai kilangu"],
    "amaranth-leaves": ["keerai", "mulai keerai", "thandu keerai", "கீரை"],
    "baby-spinach-palak": ["keerai", "palak", "pasalai keerai", "பசலைக்கீரை"], "spinach-palak": ["keerai", "palak", "pasalai keerai"],
    "fenugreek-leaves-methi": ["vendhaya keerai", "methi", "வெந்தயக்கீரை"],
    "mint-pudina": ["pudina", "புதினா"],
    "coriander-leaves": ["kothamalli", "கொத்தமல்லி"], "fresh-coriander-100-g": ["kothamalli"], "fresh-coriander-250-g": ["kothamalli"],
    "curry-leaves": ["karuveppilai", "கறிவேப்பிலை"],
    "mustard-greens": ["kadugu keerai", "keerai"], "sorrel": ["pulicha keerai"],
    "arugula-rocket": ["keerai"], "collard-greens": ["keerai"], "bok-choy-pak-choi": ["keerai"], "swiss-chard": ["keerai"],
    "watercress": ["keerai"], "kale": ["keerai"], "lettuce-iceberg": ["salad keerai"], "lettuce-romaine": ["salad keerai"], "lettuce-lollo-rosso": ["salad keerai"],
    "mixed-greens-box-1-kg": ["keerai"], "mixed-greens-box-500-g": ["keerai"], "microgreens-mixed": ["keerai"],
    "bottle-gourd-lauki": ["suraikkai", "சுரைக்காய்"], "ridge-gourd-turai": ["peerkangai", "பீர்க்கங்காய்"], "sponge-gourd": ["peerkangai"],
    "snake-gourd": ["pudalangai", "புடலங்காய்"], "bitter-gourd-karela": ["pavakkai", "pagarkai", "பாகற்காய்"],
    "ash-gourd-winter-melon": ["poosanikkai", "பூசணிக்காய்"], "chow-chow-chayote": ["chow chow"],
    "ivy-gourd-tindora": ["kovakkai", "கோவக்காய்"], "pumpkin": ["parangikkai", "பரங்கிக்காய்"],
    "broad-beans-avarakkai": ["avarakkai", "அவரைக்காய்"], "cluster-beans-gawar": ["kothavarangai", "கொத்தவரங்காய்"],
    "green-peas": ["pattani", "பட்டாணி"], "drumstick-moringa": ["murungakkai", "முருங்கைக்காய்"],
    "cabbage": ["kosu", "muttai kosu", "முட்டைக்கோஸு"], "red-cabbage": ["kosu"], "cauliflower": ["poo kosu", "பூக்கோஸு"],
    "mushroom-button": ["kaalan", "mushroom", "காளான்"], "mushroom-oyster": ["kaalan"], "mushroom-milky": ["kaalan"], "mushroom-portobello": ["kaalan"], "mushroom-shiitake": ["kaalan"],
    "banana-stem": ["vazhai thandu", "வாழைத்தண்டு"], "banana-flower": ["vazhai poo", "வாழைப்பூ"],
    "sweet-corn": ["makka cholam"], "turnip": ["turnip"]
};

export function searchHaystack(p: { handle: string; title: string; description?: string; category: string; tags?: string[] }): string {
  const extra = TAMIL_ALIASES[p.handle] || [];
  return [p.title, p.description || '', p.category, ...(p.tags || []), ...extra].join(' ').toLowerCase();
}

export function matchesQuery(p: Parameters<typeof searchHaystack>[0], q: string): boolean {
  if (!q) return true;
  const hay = searchHaystack(p);
  return q.toLowerCase().split(/\s+/).filter(Boolean).every(tok => hay.includes(tok));
}
