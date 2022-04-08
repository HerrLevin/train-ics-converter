import { Journey, Leg, Product, Remark } from "./hafas-client"
import { dateWithDelay, toShortDate } from "./date-utils"
import ical, { ICalCalendar } from 'ical-generator';

export type Event = {
    summary: string;
    description: string;
    location: string;

    start: Date;
    end: Date;
}

const getEmoji = (leg: Leg): string => {
    switch (leg.line?.product) {
        case 'bus':
            return "🚌"
        case 'national':
            return "🚄"
        case 'nationalExpress':
            return "🚅"
        case 'subway':
            return "🚇"
        case 'tram':
            return "🚊"
    }

    switch (leg.mode) {
        case 'bus':
            return "🚌"
        case 'watercraft':
            return "🚢"
        case 'taxi':
            return "🚕"
        case 'gondola':
            return "🚡"
        case 'aircraft':
            return "✈️"
        case 'car':
            return "🚗"
        case 'bicycle':
            return "🚲"
        case 'walking':
            return "🚶"
        case 'train':
        default:
            return "🚆"
    }
}

const getCancelledEmoji = ({ cancelled }: Leg): string =>
    cancelled ? "⛔" : ""

const getCancelledText = ({ cancelled }: Leg): string =>
    cancelled ? "🚨🚨 Achtung! Zug fällt aus! 🚨🚨\n\n" : ""

const getStopovers = (leg: Leg, departureTZOffset: number): string => {
    // drop the first and last leg
    leg.stopovers.shift();
    leg.stopovers.pop();

    return leg.stopovers.map((s) => {
        const arrival = s.arrival === null ? "" : `an: ${toShortDate(s.arrival, departureTZOffset)}${s.arrivalDelay ? ` + ${s.arrivalDelay / 60}min` : ""}`;
        const splitter = s.arrival !== null && s.departure !== null ? ", " : "";
        const departure = s.departure === null ? "" : `ab: ${toShortDate(s.departure, departureTZOffset)}${s.departureDelay ? ` + ${s.departureDelay / 60}min` : ""}`;
        return `${s.stop.name} (${arrival}${splitter}${departure})`;
    }
    ).join(", ");
}

const getTrwlLink = (leg: Leg): string => {
    const base_url = "https://traewelling.de/trains/trip?";

    const args = {
        tripID: leg.tripId,
        lineName: leg.line.name,
        start: leg.origin.id,
        departure: leg.departure
    }

    return `\n\nTräwelling-Check In: ` + base_url + new URLSearchParams(args).toString()
}

const getMarudorLink = (leg: Leg): string => {
    // marudor.de only offers details for a subset of transport services
    if ((["national", "nationalExpress", "regional", "regionalExp", "suburban"] as Product[]).includes(leg.line.product) === false) {
        return "";
    }

    const base_url = "https://marudor.de/api/hafas/v1/detailsRedirect/";

    return `\n\nMarudor-Link: ` + base_url + encodeURIComponent(leg.tripId);
}

const getTravelynxLink = (leg: Leg): string => {
    const base_url = "https://travelynx.de/s/";

    return `\n\nTravelynx-Link: ${base_url}${leg.origin.id}?train=` + encodeURIComponent(`${leg.line.productName} ${leg.line.fahrtNr}`);
}

const getRemarkEmoji = (r: Remark): string => {
    if (r.code === "on-board-restaurant" || r.code === "on-board-bistro" || r.code === "KG" || r.code === "BW" || r.code === "MN") {
        return '🍴'
    }

    if (r.code === "55") {
        return "🚭";
    }

    if ((r.text && r.text.toLowerCase().includes("mask")) || r.code === "3G") {
        return '🤿';
    }
    if (r.code === "komfort-checkin") {
        return '🧸';
    }

    if (r.code === "wifi") {
        return '📡';
    }

    if (r.code === "power-sockets") {
        return '🔌';
    }

    if (r.code === "GL") {
        return '👥';
    }

    if (r.code === "SL") {
        return '🛏️';
    }

    if (r.code === "ice-sprinter") {
        return '⚡';
    }

    if (r.code === "journey-cancelled") {
        return '⛔';
    }

    if (r.code === "snacks") {
        return '🥨';
    }

    if (r.code === "parents-childrens-compartment") {
        return '👪';
    }

    if (r.code === "SA") {
        return '🍼';
    }

    if (r.code && (r.code === "boarding-ramp" || r.code === "EA" || r.code === "EI" || r.code === "ER" || r.code.includes("wheelchairs") || r.code.includes("barrier"))) {
        return '♿';
    }

    if (r.code && (r.code.includes("bicycle"))) {
        return '🚲';
    }

    if (r.text && (r.text.includes("WC") || r.text.includes("toilette") || r.text.includes("restroom"))) {
        return '🚾';
    }

    if (r.text && (r.text.includes("Baustelle") || r.text.includes("Baumaßnahmen") || r.text.includes("construction"))) {
        return '🚧';
    }

    if (r.text && r.text.toLowerCase().includes("krank")) {
        return '🤒';
    }

    if (r.type === "hint") {
        return 'ℹ️';
    }

    if (r.type === "warning") {
        return '⚠️';
    }

    if (r.type === "status") {
        return '📜';
    }

    console.warn(`Found unknown remark type!: ${JSON.stringify(r)}`);

    return '⚠️';
}

const getRemarks = (remarks: Remark[] | null): string => {
    if (!remarks) return '';

    const allRemarks = remarks.map(r => getRemarkEmoji(r) + " " + r.text).join("\n");

    return `\n\nHinweise:\n${allRemarks}`;
}

export const legToEvent = ({ leg, departureTZOffset, includeTrwlLink, includeMarudorLink, includeTravelynxLink }: { leg: Leg, departureTZOffset: number, includeTrwlLink: boolean, includeMarudorLink: boolean, includeTravelynxLink: boolean }): Event | null => {
    if (leg.mode === "walking" || leg.mode === "bicycle" || leg.walking) {
        return null
    }

    const departurePlatform = leg.departurePlatform ? ` (Gl. ${leg.departurePlatform})` : "";
    const departure = dateWithDelay(leg.departure ?? leg.plannedDeparture, (leg.departureDelay / 60) - departureTZOffset);

    const arrivalPlatform = leg.arrivalPlatform ? ` (Gl. ${leg.arrivalPlatform})` : "";
    const arrival = dateWithDelay(leg.arrival ?? leg.plannedArrival, (leg.arrivalDelay / 60) - departureTZOffset);

    if (typeof leg.stopovers === "undefined"
        || leg.stopovers.length === 2) { // origin and destination are part of the stopovers list, if available
        leg.stopovers = [];
    }
    const stopoverList = (leg.stopovers.length !== 0) ? `\nZwischenstop${leg.stopovers.length === 3 ? "" : "s"}: ${getStopovers(leg, departureTZOffset)}` : "";

    return {
        summary: `${getEmoji(leg)}${getCancelledEmoji(leg)} ${leg.line?.name}: ${leg.origin.name}${departurePlatform} -> ${leg.destination.name}${arrivalPlatform}`,
        description: `${getCancelledText(leg)}${leg.line.operator?.name ? `Betreiber: ${leg.line.operator.name}` : ""}${stopoverList}${includeTrwlLink ? `${getTrwlLink(leg)}` : ""}${includeTravelynxLink ? `${getTravelynxLink(leg)}` : ""}${includeMarudorLink ? `${getMarudorLink(leg)}` : ""}${getRemarks(leg.remarks)}`,
        start: departure,
        end: arrival,
        location: leg.origin.name
    }
}

export const toCalendar = ({ journey, departureTZOffset, includeTrwlLink, includeMarudorLink, includeTravelynxLink }: { journey: Journey, departureTZOffset: number, includeTrwlLink: boolean, includeMarudorLink: boolean, includeTravelynxLink: boolean }): ICalCalendar => {
    const origin = journey.legs[0].origin.name
    const destination = journey.legs[journey.legs.length - 1].destination.name
    const events = journey.legs.map(leg => legToEvent({ leg, departureTZOffset, includeTrwlLink, includeMarudorLink, includeTravelynxLink })).filter(e => e !== null)

    const calendar = ical({
        name: `Reise von ${origin} nach ${destination}`,
        prodId: "//cal.iamjannik.me//Train-ICS-Converter//EN",
    });

    events.forEach((e) => {
        const event = calendar.createEvent(e);
        event.timezone('Europe/Berlin')
    });

    return calendar;
}