/**
 * Built-in starter content: "Economics Unit Review — Markets, Circular Flow, Supply & Demand".
 * 40 questions (10 per type). Plain data, loaded into the database for the teacher to edit.
 * The Chick-fil-A numbers are fictional classroom numbers.
 */
import type { QuestionData } from "../types";

export interface SeedQuestion {
  prompt: string;
  data: QuestionData;
  explanation: string;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  points: number;
}

const CFA_TABLE = `| Price | Quantity Supplied | Quantity Demanded |
| $3 | 100 | 500 |
| $6 | 300 | 300 |
| $9 | 500 | 100 |`;

const T = {
  flow: "Circular Flow Model",
  resource: "Resource Market",
  product: "Product Market",
  supply: "Supply",
  demand: "Demand",
  eq: "Equilibrium",
  ss: "Shortages & Surpluses",
};

const m = (term: string, match: string, explanation: string, topic: string, difficulty: SeedQuestion["difficulty"] = "easy"): SeedQuestion => ({
  prompt: term,
  data: { type: "matching", match },
  explanation,
  topic,
  difficulty,
  points: 1,
});

const fib = (prompt: string, answers: string[], explanation: string, topic: string, rejected: string[] = [], difficulty: SeedQuestion["difficulty"] = "medium"): SeedQuestion => ({
  prompt,
  data: { type: "fill_blank", answers, rejected, allowTypos: true },
  explanation,
  topic,
  difficulty,
  points: 1,
});

const mc = (prompt: string, correct: string, wrong: string[], explanation: string, topic: string, difficulty: SeedQuestion["difficulty"] = "medium"): SeedQuestion => ({
  prompt,
  data: {
    type: "multiple_choice",
    choices: [correct, ...wrong].map((text, i) => ({ id: String.fromCharCode(97 + i), text })),
    correctId: "a",
    shuffle: true,
  },
  explanation,
  topic,
  difficulty,
  points: 1,
});

const sa = (
  prompt: string,
  rubric: { concept: string; points: number; phrases: string[] }[],
  sampleAnswer: string,
  explanation: string,
  topic: string,
  misconceptions: string[] = [],
  difficulty: SeedQuestion["difficulty"] = "medium",
): SeedQuestion => ({
  prompt,
  data: {
    type: "short_answer",
    rubric: rubric.map((r, i) => ({ id: `c${i + 1}`, ...r })),
    sampleAnswer,
    misconceptions,
    minWords: 8,
  },
  explanation,
  topic,
  difficulty,
  points: 1,
});

export const ECON_REVIEW_TITLE = "Economics Unit Review — Markets, Circular Flow, Supply & Demand";

export const ECON_REVIEW_DIRECTIONS = `This review has four sections: Matching, Fill in the Blank, Multiple Choice, and Short Answer.
Answer every question in a section, then submit it. You need at least 70% on a section to unlock the next one. If you score lower, read the explanations and try again — your work saves automatically.`;

export const MATCHING: SeedQuestion[] = [
  m("Households", "Individuals and families who own resources (like their labor) and buy goods and services",
    "Households are the people in the economy. They SELL resources such as their labor to businesses, and they BUY goods and services from businesses.", T.flow),
  m("Businesses", "Organizations that use resources to produce goods and services to sell",
    "Businesses (also called firms) buy resources from households and turn them into goods and services they sell — like a restaurant turning ingredients and workers' time into meals.", T.flow),
  m("Resource Market", "Where businesses obtain the factors of production from households",
    "In the Resource Market, households are the sellers and businesses are the buyers. Businesses get land, labor, capital, and entrepreneurship, and households receive income.", T.resource),
  m("Product Market", "Where households buy finished goods and services from businesses",
    "In the Product Market, businesses are the sellers and households (customers) are the buyers. Customers spend money and receive goods and services.", T.product),
  m("Land", "Natural resources, such as the soil a farm uses to grow lettuce for a restaurant",
    "Land means ALL natural resources — soil, water, trees, oil, and the ground a building sits on.", T.resource),
  m("Labor", "Human effort and work, such as a cashier taking orders at Chick-fil-A",
    "Labor is the work people do. The cashier is selling their time and effort to the business in exchange for wages.", T.resource),
  m("Capital", "Tools, equipment, and buildings used to make products, such as a restaurant's fryers and ovens",
    "In economics, capital means man-made tools used to produce other goods — not just money. Fryers, ovens, computers, and delivery trucks are capital.", T.resource),
  m("Entrepreneurship", "Taking the risk to start and organize a business, such as a student launching a sneaker-cleaning service",
    "Entrepreneurs combine land, labor, and capital and take on the risk of starting a business. Their reward is profit.", T.resource),
  m("Equilibrium", "The point where quantity supplied equals quantity demanded",
    "At equilibrium the amount sellers want to sell equals the amount buyers want to buy, so there is no shortage and no surplus. It's where the supply and demand curves cross.", T.eq, "medium"),
  m("Shortage", "When quantity demanded is greater than quantity supplied",
    "A shortage means buyers want more than sellers are offering — the product sells out. Shortages happen when the price is BELOW equilibrium.", T.ss, "medium"),
];

export const FILL_BLANK: SeedQuestion[] = [
  fib("In the circular flow model, ___ provide land, labor, capital, and entrepreneurship to businesses.",
    ["households", "household", "people", "individuals", "families"],
    "Households own the factors of production. They provide (sell) these resources to businesses in the Resource Market and get income in return.",
    T.flow, ["businesses", "business", "firms", "the government", "government"], "easy"),
  fib("Businesses get the factors of production they need in the ___ market.",
    ["resource", "resource market", "factor", "factor market", "factors of production", "input"],
    "Businesses BUY resources in the Resource Market. Remember: in the Resource Market, households sell and businesses buy.",
    T.resource, ["product", "product market", "goods", "goods and services", "stock"], "easy"),
  fib("When you buy a chicken sandwich at Chick-fil-A, that exchange happens in the ___ market.",
    ["product", "product market", "goods and services", "goods", "output"],
    "You are a customer buying a finished good from a business, so this is the Product Market. Money flows to the business and the sandwich flows to you.",
    T.product, ["resource", "resource market", "factor", "labor"], "easy"),
  fib("In return for the resources they provide, households receive ___ from businesses.",
    ["income", "money", "payment", "payments", "wages", "pay", "wages and income", "income and payments"],
    "Businesses pay households for their resources — wages for labor, rent for land, interest for capital, and profit for entrepreneurship. All of these are income.",
    T.flow, ["goods", "goods and services", "products", "resources", "spending"]),
  fib("According to the law of supply, when the price of a product increases, the quantity supplied ___.",
    ["increases", "increase", "goes up", "go up", "rises", "rise", "gets bigger", "grows", "gets higher", "is higher", "will increase", "also increases"],
    "Sellers want to sell MORE at higher prices because they can earn more profit. Price and quantity supplied move in the SAME direction.",
    T.supply, ["decreases", "decrease", "goes down", "falls", "drops", "stays the same", "lowers"]),
  fib("According to the law of demand, when the price of a product increases, the quantity demanded ___.",
    ["decreases", "decrease", "goes down", "go down", "falls", "fall", "drops", "drop", "gets smaller", "declines", "lowers", "will decrease", "is lower", "gets lower"],
    "Buyers purchase LESS when prices rise because they can afford less and may switch to cheaper options. Price and quantity demanded move in OPPOSITE directions.",
    T.demand, ["increases", "increase", "goes up", "rises", "stays the same", "grows"]),
  fib("The point where the supply curve and the demand curve cross is called ___.",
    ["equilibrium", "market equilibrium", "equilibrium point", "the equilibrium point", "equilibrium price"],
    "Equilibrium is where the two curves intersect. At that price, quantity supplied equals quantity demanded.",
    T.eq, ["shortage", "surplus", "supply", "demand"], "easy"),
  fib(`Use the fictional Chick-fil-A table:\n\n${CFA_TABLE}\n\nThe equilibrium price is $___.`,
    ["6", "$6", "6 dollars", "six", "$6.00"],
    "Look for the row where Quantity Supplied equals Quantity Demanded. At $6, both are 300 sandwiches, so $6 is the equilibrium price.",
    T.eq, ["3", "9", "300"]),
  fib(`Use the fictional Chick-fil-A table:\n\n${CFA_TABLE}\n\nAt a price of $9, the surplus is ___ sandwiches.`,
    ["400"],
    "A surplus is quantity supplied minus quantity demanded. At $9: 500 supplied − 100 demanded = 400 extra sandwiches.",
    T.ss, ["600", "500", "100"], "medium"),
  fib("When quantity supplied is greater than quantity demanded, the market has a ___.",
    ["surplus", "excess supply", "surplus of goods"],
    "More is being offered than buyers want, so products are left over — that's a surplus. Surpluses happen when the price is ABOVE equilibrium.",
    T.ss, ["shortage", "equilibrium", "deficit"], "easy"),
];

export const MULTIPLE_CHOICE: SeedQuestion[] = [
  mc("Maya works 15 hours a week as a cook at a pizza restaurant. In the circular flow model, what is Maya providing, and in which market?",
    "Labor, in the Resource Market",
    ["Labor, in the Product Market", "Goods and services, in the Product Market", "Income, in the Resource Market"],
    "Maya is a member of a household selling her work (labor) to a business. Businesses buy labor in the Resource Market, and Maya earns income (wages) in return.", T.resource),
  mc("Which of these is a Product Market transaction?",
    "You pay $25 for a school spirit hoodie at the school store",
    ["A restaurant hires a new cook", "A sneaker company rents land for a new warehouse", "A student is paid to work at a car wash"],
    "In the Product Market, a household (customer) pays a business for a finished good or service. Hiring workers, renting land, and getting paid for work are all Resource Market exchanges.", T.product),
  mc("In the circular flow model, which way does money flow in the Product Market?",
    "From households to businesses, as spending on goods and services",
    ["From businesses to households, as income", "From households to businesses, as wages", "Money doesn't move in the Product Market — only goods do"],
    "In the Product Market, customers (households) spend money, and businesses provide goods and services. The money moving from businesses to households (income) happens in the Resource Market.", T.flow),
  mc("A food truck owner buys a new grill so she can cook burgers faster. The grill is an example of which factor of production?",
    "Capital",
    ["Land", "Labor", "Entrepreneurship"],
    "Capital is equipment and tools made by people and used to produce other goods. The grill helps produce burgers, so it is capital.", T.resource, "easy"),
  mc("Why does the demand curve slope downward?",
    "Because as the price goes down, buyers are willing and able to buy more",
    ["Because as the price goes down, sellers want to sell more", "Because as the price goes up, buyers want to buy more", "Because demand always decreases over time"],
    "The demand curve shows the law of demand: lower prices → buyers buy more; higher prices → buyers buy less. That inverse (opposite) relationship makes the line slope down from left to right.", T.demand),
  mc(`A student runs a custom-sneaker business. Look at her supply schedule:\n\n| Price per pair | Pairs Supplied |\n| $20 | 40 |\n| $40 | 80 |\n| $60 | 120 |\n\nWhat does this table show?`,
    "As the price rises, quantity supplied rises, so her supply curve slopes upward",
    ["As the price rises, quantity supplied rises, so her supply curve slopes downward", "As the price rises, quantity supplied falls", "Price and quantity supplied are not related"],
    "Price and quantity supplied both increase together. Plotted on a graph, that makes the supply curve slope UPWARD from left to right — the law of supply.", T.supply),
  mc(`Use the fictional Chick-fil-A table:\n\n${CFA_TABLE}\n\nWhat are the equilibrium price and equilibrium quantity?`,
    "$6 and 300 sandwiches",
    ["$3 and 500 sandwiches", "$9 and 500 sandwiches", "$6 and 600 sandwiches"],
    "Equilibrium is where quantity supplied equals quantity demanded. At $6, 300 are supplied and 300 are demanded. (Don't add them together — the equilibrium quantity is 300.)", T.eq),
  mc(`Use the fictional Chick-fil-A table:\n\n${CFA_TABLE}\n\nWhat happens at a price of $3?`,
    "A shortage of 400 sandwiches",
    ["A surplus of 400 sandwiches", "A shortage of 600 sandwiches", "The market is at equilibrium"],
    "At $3, customers want 500 but only 100 are supplied. Quantity demanded is greater, so it's a shortage: 500 − 100 = 400 sandwiches.", T.ss),
  mc("A shortage happens when the price is ___ the equilibrium price.",
    "below",
    ["above", "equal to", "twice"],
    "When the price is too LOW (below equilibrium), lots of buyers want the product but sellers don't want to make many — so the product runs out. Prices above equilibrium cause surpluses.", T.ss),
  mc("The school store prices hoodies at $60. At that price, only 20 students want one, but the store has 90 hoodies. What is the result?",
    "A surplus of 70 hoodies",
    ["A shortage of 70 hoodies", "A surplus of 110 hoodies", "The market is at equilibrium"],
    "Quantity supplied (90) is greater than quantity demanded (20), so there is a surplus: 90 − 20 = 70 hoodies left over. The store would likely lower the price.", T.ss, "hard"),
];

export const SHORT_ANSWER: SeedQuestion[] = [
  sa("Explain how the Product Market is different from the Resource Market.",
    [
      { concept: "In the Product Market, households (customers) buy goods and services from businesses", points: 2,
        phrases: ["product market goods services", "product market buy", "customers buy goods", "households buy goods", "households buy products", "people buy products", "buy finished goods", "product market customers"] },
      { concept: "In the Resource Market, businesses get factors of production (land, labor, capital, entrepreneurship) from households", points: 2,
        phrases: ["resource market factors of production", "resource market resources", "businesses buy resources", "businesses get resources", "resource market labor", "land labor capital", "businesses hire workers", "resource market workers"] },
      { concept: "The buyers and sellers switch roles between the two markets", points: 1,
        phrases: ["households sell", "businesses are the buyers", "businesses buy", "roles switch", "opposite", "households are sellers", "businesses sell"] },
    ],
    "In the Product Market, households buy finished goods and services from businesses, like buying a sandwich. In the Resource Market, it's the opposite: households sell their land, labor, capital, and entrepreneurship to businesses and get income in return.",
    "Ask: who is selling, and what is being sold? Products (goods/services) are sold by businesses in the Product Market. Resources (land, labor, capital, entrepreneurship) are sold by households in the Resource Market.",
    T.product, ["product market households sell resources", "resource market buy goods"]),
  sa("Why does the demand curve slope downward?",
    [
      { concept: "When price goes up, quantity demanded goes down (and when price goes down, people buy more)", points: 2,
        phrases: ["price increase quantity demanded decrease", "price goes up buy less", "higher price buy less", "higher price fewer", "price rises buy less", "price up demand down", "lower price buy more", "cheap buy more", "price decreases buy more", "price goes down buy more", "price drops buy more", "price high people buy less", "expensive buy less"] },
      { concept: "Explains why buyers act this way (budget/afford, cheaper substitutes, willing and able)", points: 1,
        phrases: ["afford", "budget", "substitute", "other options", "willing and able", "save money", "not enough money", "cheaper option", "worth it"] },
      { concept: "Connects this to the law of demand or the inverse relationship", points: 1,
        phrases: ["law of demand", "inverse", "opposite direction", "opposite"] },
    ],
    "The demand curve slopes downward because of the law of demand: when the price goes up, people buy less, and when the price goes down, people buy more. Buyers have limited money, so at higher prices they can afford less or switch to cheaper substitutes.",
    "Price and quantity demanded move in opposite directions. Plotting that on a graph (price going up the side, quantity along the bottom) makes the line slope down.",
    T.demand, ["demand curve slopes upward", "price increases quantity demanded increases", "higher price buy more"]),
  sa("Describe what a shortage means for a business, such as a sneaker store selling a popular new shoe.",
    [
      { concept: "Quantity demanded is greater than quantity supplied — more customers want the shoe than the store has", points: 2,
        phrases: ["demand more than supply", "quantity demanded greater quantity supplied", "demanded greater than supplied", "more people want", "more customers want", "not enough", "run out", "sold out", "sell out"] },
      { concept: "The price is below equilibrium (too low)", points: 1,
        phrases: ["below equilibrium", "price too low", "price is low", "price low"] },
      { concept: "What the business might do or experience (raise the price, order or make more, lose sales/unhappy customers)", points: 1,
        phrases: ["raise price", "raise the price", "increase price", "higher price", "lose customers", "lost sales", "make more", "order more", "produce more", "restock", "waiting list", "unhappy customers"] },
    ],
    "A shortage means the store doesn't have enough shoes for everyone who wants them — quantity demanded is greater than quantity supplied, so the shoes sell out. This happens when the price is below equilibrium. The store could raise the price or order more shoes, and it may lose sales from customers who leave empty-handed.",
    "Think 'sold out': a shortage = quantity demanded > quantity supplied, caused by a price below equilibrium. Businesses usually respond by raising prices or supplying more.",
    T.ss, ["shortage means too many shoes", "quantity supplied greater than quantity demanded", "left over"]),
  sa("Describe the four exchanges in the circular flow model between households and businesses.",
    [
      { concept: "Households provide resources (land, labor, capital, entrepreneurship) to businesses", points: 1,
        phrases: ["households resources businesses", "households provide resources", "provide labor", "land labor capital", "sell resources", "factors of production", "households give resources", "work for businesses"] },
      { concept: "Businesses pay households income (wages, rent, interest, profit)", points: 1,
        phrases: ["income", "wages", "businesses pay households", "get paid", "paychecks", "salary"] },
      { concept: "Households spend money on goods and services", points: 1,
        phrases: ["spend", "spending", "households pay businesses", "pay for goods", "money for products", "buy goods", "households buy"] },
      { concept: "Businesses provide goods and services to households", points: 1,
        phrases: ["businesses provide goods", "businesses give goods", "goods and services to households", "businesses sell", "businesses provide products", "goods services households", "products to households"] },
    ],
    "1) Households provide resources (land, labor, capital, entrepreneurship) to businesses. 2) Businesses pay households income for those resources. 3) Households spend money on goods and services. 4) Businesses provide goods and services to households.",
    "There are two loops. Resource Market: resources go to businesses, income goes back to households. Product Market: spending goes to businesses, goods and services go back to households.",
    T.flow, [], "hard"),
  sa(`Use the fictional Chick-fil-A table to explain why $6 is the equilibrium price.\n\n${CFA_TABLE}`,
    [
      { concept: "At $6, quantity supplied equals quantity demanded (300 = 300)", points: 2,
        phrases: ["supplied equals demanded", "supplied equal demanded", "supply equals demand", "300 300", "same amount", "equal", "same", "match"] },
      { concept: "There is no shortage and no surplus at $6", points: 1,
        phrases: ["no shortage", "no surplus", "nothing left over", "no extra", "neither shortage surplus", "everyone who wants one gets one"] },
      { concept: "It is where the supply and demand curves intersect", points: 1,
        phrases: ["intersect", "cross", "meet", "curves meet"] },
    ],
    "$6 is the equilibrium price because at $6 Chick-fil-A supplies 300 sandwiches and customers demand 300 sandwiches. Quantity supplied equals quantity demanded, so there's no shortage and no surplus — it's where the supply and demand curves cross.",
    "Equilibrium = the price where quantity supplied equals quantity demanded. Compare the two columns in each row; they match only at $6.",
    T.eq),
  sa(`At a price of $9, Chick-fil-A would have a surplus. Explain what that means and calculate the size of the surplus.\n\n${CFA_TABLE}`,
    [
      { concept: "A surplus means quantity supplied is greater than quantity demanded (sandwiches left over)", points: 2,
        phrases: ["supplied more than demanded", "supplied greater than demanded", "supply more than demand", "more sandwiches want", "more sandwiches than people want", "left over", "extra sandwiches", "too many sandwiches", "not enough customers"] },
      { concept: "Correctly calculates 500 − 100 = 400 sandwiches", points: 2,
        phrases: ["400"] },
      { concept: "Notes that $9 is above the equilibrium price (too high)", points: 1,
        phrases: ["above equilibrium", "price too high", "too expensive", "higher than equilibrium", "price is high"] },
    ],
    "A surplus means there are more sandwiches than customers want to buy. At $9, Chick-fil-A supplies 500 but customers only demand 100, so the surplus is 500 − 100 = 400 sandwiches. This happens because $9 is above the equilibrium price.",
    "Surplus = quantity supplied − quantity demanded. Read the $9 row: 500 − 100 = 400.",
    T.ss, ["shortage of 400", "it is a shortage"]),
  sa("Why do households and businesses depend on each other in the circular flow model?",
    [
      { concept: "Businesses need the resources households provide, such as workers (labor)", points: 1,
        phrases: ["businesses need workers", "need labor", "need resources", "households provide resources", "businesses need households", "need employees", "need people to work"] },
      { concept: "Households need the income (jobs, wages) businesses pay", points: 1,
        phrases: ["need income", "need jobs", "need money", "get paid", "wages", "households need businesses", "earn money"] },
      { concept: "Households need goods/services from businesses, and businesses need households to buy them (spending/customers)", points: 1,
        phrases: ["need customers", "buy goods", "spending", "need products", "make money from", "households buy", "need goods", "sell products"] },
    ],
    "Businesses need households because households provide the labor and other resources businesses use, and households are the customers who buy their products. Households need businesses because businesses pay them income and provide the goods and services they want. Each side's money and products keep the other side going.",
    "Follow the circle: what each side gives is exactly what the other side needs. Without workers and customers, businesses can't operate; without jobs and products, households can't earn or buy.",
    T.flow),
  sa("Explain the law of supply using an example of a student's business (for example, making custom phone cases).",
    [
      { concept: "When the price rises, the quantity supplied rises (sellers make/sell more)", points: 2,
        phrases: ["price increase quantity supplied increase", "higher price make more", "price goes up make more", "price up supply up", "price rises produce more", "price goes up sell more", "higher price supply more", "price increases more cases", "price goes up more cases", "lower price make less", "lower price fewer"] },
      { concept: "Explains why: higher prices mean more profit or more incentive", points: 1,
        phrases: ["profit", "make more money", "earn more", "worth it", "incentive", "more money"] },
      { concept: "Uses a specific example", points: 1,
        phrases: ["phone case", "case", "for example", "example", "sneaker", "shirt", "cookie", "bracelet", "if i", "my business"] },
    ],
    "The law of supply says that when the price goes up, sellers supply more. For example, if custom phone cases sell for $10, I might make 5 a week, but if they sell for $25, I'd make 20 a week because I earn more profit for each one.",
    "Price and quantity supplied move in the same direction because higher prices make producing more worth the seller's time and money.",
    T.supply, ["price increases make less", "higher price supply less"]),
  sa("Choose any business. Give an example of how it uses each of the four factors of production: land, labor, capital, and entrepreneurship.",
    [
      { concept: "Land — a natural resource the business uses", points: 1,
        phrases: ["land", "natural resource", "water", "soil", "farm", "wood", "trees", "property"] },
      { concept: "Labor — workers and their effort", points: 1,
        phrases: ["labor", "workers", "employees", "cashier", "cook", "staff", "worker"] },
      { concept: "Capital — tools, equipment, or buildings", points: 1,
        phrases: ["capital", "equipment", "tools", "machine", "oven", "computer", "grill", "fryer", "truck", "building"] },
      { concept: "Entrepreneurship — the owner who takes the risk to start the business", points: 1,
        phrases: ["entrepreneur", "entrepreneurship", "owner", "started the business", "risk", "founder"] },
    ],
    "A pizza restaurant uses land for the ground the building sits on and the wheat used for dough, labor from the cooks and delivery drivers, capital like the pizza ovens and delivery cars, and entrepreneurship from the owner who took the risk to open it.",
    "Check each factor: Land = natural resources. Labor = human work. Capital = man-made tools/equipment. Entrepreneurship = the person who takes the risk and organizes the business.",
    T.resource, ["capital is money"], "hard"),
  sa("A new video game launches at $70. Stores sell out on the first day and have long waiting lists. Is this a shortage or a surplus? Explain using quantity demanded and quantity supplied.",
    [
      { concept: "Identifies it as a shortage", points: 1,
        phrases: ["shortage"] },
      { concept: "Quantity demanded is greater than quantity supplied (more people want the game than there are copies)", points: 2,
        phrases: ["demanded greater supplied", "demanded more than supplied", "demand more than supply", "more people want", "not enough games", "not enough copies", "quantity demanded higher", "quantity supplied less"] },
      { concept: "Connects to price: $70 is below equilibrium, or the price may rise", points: 1,
        phrases: ["below equilibrium", "price too low", "raise price", "price will go up", "price could rise", "increase price", "price go up"] },
    ],
    "This is a shortage. Quantity demanded is greater than quantity supplied — more people want the game at $70 than there are copies, so it sells out. That suggests $70 is below the equilibrium price, so stores or resellers might raise the price.",
    "Selling out + waiting lists = buyers want more than sellers have. That's quantity demanded > quantity supplied, which is a shortage.",
    T.ss, ["surplus", "supplied more than demanded"]),
];
