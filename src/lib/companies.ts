import goldImg from "@/assets/hero-gold.jpg";
import jewelleryImg from "@/assets/jewellery.jpg";
import carsImg from "@/assets/cars.jpg";
import tradingImg from "@/assets/trading.jpg";
import currencyImg from "@/assets/currency.jpg";
import mobilesImg from "@/assets/mobiles.jpg";
import realestateImg from "@/assets/realestate.jpg";
import carTradeImg from "@/assets/car-trade.jpg";
import transferImg from "@/assets/transfer.jpg";

export type Company = {
  id: string;
  name: string;
  tag: string;
  sector: string;
  description: string;
  image: string;
};

export type Service = {
  id: string;
  name: string;
  tag: string;
  sector: string;
  description: string;
  image: string;
};

export const companies: Company[] = [
  {
    id: "gold-bridge",
    name: "Golden Bridge",
    tag: "01",
    sector: "Precious Metals & Bullion",
    description:
      "Trading desk for physical gold and silver bullion. Sourcing, refining liaison and secured logistics for institutional clients across the Gulf.",
    image: goldImg,
  },
  {
    id: "izirova",
    name: "Izirova Jewellery",
    tag: "02",
    sector: "Fine Jewellery",
    description:
      "An atelier crafting fine gold and diamond jewellery. Heritage techniques applied to contemporary design with full transparency on materials.",
    image: jewelleryImg,
  },
  {
    id: "treeway",
    name: "Treeway General Trading",
    tag: "03",
    sector: "Global Trade",
    description:
      "General trading arm covering commodities, consumer goods and specialty imports. Long-standing partnerships across Asia, Africa and the Middle East.",
    image: tradingImg,
  },
  {
    id: "vicecity",
    name: "ViceCity Car Rental",
    tag: "04",
    sector: "Premium Mobility",
    description:
      "Luxury and exotic vehicle rental in the Emirates. From daily premium hires to chauffeured experiences and long-term corporate fleets.",
    image: carsImg,
  },
];

export const services: Service[] = [
  {
    id: "currencies",
    name: "Currency & FX Desk",
    tag: "01",
    sector: "Foreign Exchange",
    description:
      "In-house currency exchange and FX operations. Competitive rates on major and emerging market pairs with rapid settlement.",
    image: currencyImg,
  },
  {
    id: "mobiles",
    name: "Mobile Devices",
    tag: "02",
    sector: "Consumer Electronics",
    description:
      "Wholesale import and export of mobile devices and accessories. Bulk sourcing of genuine stock from authorised channels with regional distribution.",
    image: mobilesImg,
  },
  {
    id: "realestate",
    name: "Real Estate",
    tag: "03",
    sector: "Property & Development",
    description:
      "Residential and commercial real estate acquisition, brokerage and long-term holdings across our active markets.",
    image: realestateImg,
  },
  {
    id: "car-trade",
    name: "Car Trading & Import-Export",
    tag: "04",
    sector: "Automotive Trade",
    description:
      "International car trading with full import and export services. Sourcing, shipping and documentation for individual buyers, dealers and fleet operators.",
    image: carTradeImg,
  },
  {
    id: "banking-transfer",
    name: "Banking Transfer",
    tag: "05",
    sector: "Global Banking Transfers",
    description:
      "Fast and secure banking transfer services to Africa, Europe, China, UAE, Turkey and beyond. Competitive rates with rapid settlement across our banking network.",
    image: transferImg,
  },
];
