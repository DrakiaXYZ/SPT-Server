import { BotHelper } from "@spt/helpers/BotHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { IConfig } from "@spt/models/eft/common/IGlobals";
import { ILocation } from "@spt/models/eft/common/ILocation";
import { IAdditionalHostilitySettings, IBossLocationSpawn } from "@spt/models/eft/common/ILocationBase";
import { IInventory } from "@spt/models/eft/common/tables/IBotType";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { ItemTpl } from "@spt/models/enums/ItemTpl";
import { Season } from "@spt/models/enums/Season";
import { SeasonalEventType } from "@spt/models/enums/SeasonalEventType";
import { IHttpConfig } from "@spt/models/spt/config/IHttpConfig";
import { ILocationConfig } from "@spt/models/spt/config/ILocationConfig";
import { IQuestConfig } from "@spt/models/spt/config/IQuestConfig";
import {
    ISeasonalEvent,
    ISeasonalEventConfig,
    ISeasonalEventSettings,
    IZombieSettings,
} from "@spt/models/spt/config/ISeasonalEventConfig";
import { IWeatherConfig } from "@spt/models/spt/config/IWeatherConfig";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { GiftService } from "@spt/services/GiftService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { DatabaseImporter } from "@spt/utils/DatabaseImporter";
import { inject, injectable } from "tsyringe";

@injectable()
export class SeasonalEventService {
    protected seasonalEventConfig: ISeasonalEventConfig;
    protected questConfig: IQuestConfig;
    protected httpConfig: IHttpConfig;
    protected weatherConfig: IWeatherConfig;
    protected locationConfig: ILocationConfig;

    protected halloweenEventActive?: boolean = undefined;
    protected christmasEventActive?: boolean = undefined;

    /** All events active at this point in time */
    protected currentlyActiveEvents: ISeasonalEvent[] = [];

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("DatabaseImporter") protected databaseImporter: DatabaseImporter,
        @inject("GiftService") protected giftService: GiftService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("BotHelper") protected botHelper: BotHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("ConfigServer") protected configServer: ConfigServer,
    ) {
        this.seasonalEventConfig = this.configServer.getConfig(ConfigTypes.SEASONAL_EVENT);
        this.questConfig = this.configServer.getConfig(ConfigTypes.QUEST);
        this.httpConfig = this.configServer.getConfig(ConfigTypes.HTTP);
        this.weatherConfig = this.configServer.getConfig(ConfigTypes.WEATHER);
        this.locationConfig = this.configServer.getConfig(ConfigTypes.LOCATION);

        this.cacheActiveEvents();
    }

    protected get christmasEventItems(): string[] {
        return [
            ItemTpl.FACECOVER_FAKE_WHITE_BEARD,
            ItemTpl.BARTER_CHRISTMAS_TREE_ORNAMENT_RED,
            ItemTpl.BARTER_CHRISTMAS_TREE_ORNAMENT_VIOLET,
            ItemTpl.BARTER_CHRISTMAS_TREE_ORNAMENT_SILVER,
            ItemTpl.HEADWEAR_DED_MOROZ_HAT,
            ItemTpl.HEADWEAR_SANTA_HAT,
            ItemTpl.BACKPACK_SANTAS_BAG,
            ItemTpl.RANDOMLOOTCONTAINER_NEW_YEAR_GIFT_BIG,
            ItemTpl.RANDOMLOOTCONTAINER_NEW_YEAR_GIFT_MEDIUM,
            ItemTpl.RANDOMLOOTCONTAINER_NEW_YEAR_GIFT_SMALL,
            ItemTpl.BARTER_SPECIAL_40DEGREE_FUEL,
            ItemTpl.BARTER_SHYSHKA_CHRISTMAS_TREE_LIFE_EXTENDER,
            ItemTpl.HEADWEAR_ELF_HAT,
            ItemTpl.HEADWEAR_MASKA1SCH_BULLETPROOF_HELMET_CHRISTMAS_EDITION,
            ItemTpl.ARMOR_6B13_M_ASSAULT_ARMOR_CHRISTMAS_EDITION,
            ItemTpl.HEADWEAR_HAT_WITH_HORNS,
            ItemTpl.BARTER_JAR_OF_PICKLES,
            ItemTpl.BARTER_OLIVIER_SALAD_BOX,
            ItemTpl.FACECOVER_ASTRONOMER_MASK,
            ItemTpl.FACECOVER_CIPOLLINO_MASK,
            ItemTpl.FACECOVER_ROOSTER_MASK,
            ItemTpl.FACECOVER_FOX_MASK,
            ItemTpl.FACECOVER_GRINCH_MASK,
            ItemTpl.FACECOVER_HARE_MASK,
            ItemTpl.FACECOVER_AYBOLIT_MASK,
            ItemTpl.BARTER_SPECIAL_40DEGREE_FUEL,
            ItemTpl.FLARE_RSP30_REACTIVE_SIGNAL_CARTRIDGE_FIREWORK,
        ];
    }

    protected get halloweenEventItems(): string[] {
        return [
            ItemTpl.FACECOVER_SPOOKY_SKULL_MASK,
            ItemTpl.RANDOMLOOTCONTAINER_PUMPKIN_RAND_LOOT_CONTAINER,
            ItemTpl.HEADWEAR_JACKOLANTERN_TACTICAL_PUMPKIN_HELMET,
            ItemTpl.FACECOVER_FACELESS_MASK,
            ItemTpl.FACECOVER_JASON_MASK,
            ItemTpl.FACECOVER_MISHA_MAYOROV_MASK,
            ItemTpl.FACECOVER_SLENDER_MASK,
            ItemTpl.FACECOVER_GHOUL_MASK,
            ItemTpl.FACECOVER_HOCKEY_PLAYER_MASK_CAPTAIN,
            ItemTpl.FACECOVER_HOCKEY_PLAYER_MASK_BRAWLER,
            ItemTpl.FACECOVER_HOCKEY_PLAYER_MASK_QUIET,
        ];
    }

    /**
     * Get an array of christmas items found in bots inventories as loot
     * @returns array
     */
    public getChristmasEventItems(): string[] {
        return this.christmasEventItems;
    }

    /**
     * Get an array of halloween items found in bots inventories as loot
     * @returns array
     */
    public getHalloweenEventItems(): string[] {
        return this.halloweenEventItems;
    }

    public itemIsChristmasRelated(itemTpl: string): boolean {
        return this.christmasEventItems.includes(itemTpl);
    }

    public itemIsHalloweenRelated(itemTpl: string): boolean {
        return this.halloweenEventItems.includes(itemTpl);
    }

    /**
     * Check if item id exists in christmas or halloween event arrays
     * @param itemTpl item tpl to check for
     * @returns
     */
    public itemIsSeasonalRelated(itemTpl: string): boolean {
        return this.christmasEventItems.includes(itemTpl) || this.halloweenEventItems.includes(itemTpl);
    }

    /**
     * Get active seasonal events
     * @returns Array of active events
     */
    public getActiveEvents(): ISeasonalEvent[] {
        return this.currentlyActiveEvents;
    }

    /**
     * Get an array of seasonal items that should not appear
     * e.g. if halloween is active, only return christmas items
     * or, if halloween and christmas are inactive, return both sets of items
     * @returns array of tpl strings
     */
    public getInactiveSeasonalEventItems(): string[] {
        const items: string[] = [];
        if (!this.christmasEventEnabled()) {
            items.push(...this.christmasEventItems);
        }

        if (!this.halloweenEventEnabled()) {
            items.push(...this.halloweenEventItems);
        }

        return items;
    }

    /**
     * Is a seasonal event currently active
     * @returns true if event is active
     */
    public seasonalEventEnabled(): boolean {
        return this.christmasEventEnabled() || this.halloweenEventEnabled();
    }

    /**
     * Is christmas event active
     * @returns true if active
     */
    public christmasEventEnabled(): boolean {
        return this.christmasEventActive ?? false;
    }

    /**
     * is halloween event active
     * @returns true if active
     */
    public halloweenEventEnabled(): boolean {
        return this.halloweenEventActive ?? false;
    }

    /**
     * Is detection of seasonal events enabled (halloween / christmas)
     * @returns true if seasonal events should be checked for
     */
    public isAutomaticEventDetectionEnabled(): boolean {
        return this.seasonalEventConfig.enableSeasonalEventDetection;
    }

    /**
     * Get a dictionary of gear changes to apply to bots for a specific event e.g. Christmas/Halloween
     * @param eventName Name of event to get gear changes for
     * @returns bots with equipment changes
     */
    protected getEventBotGear(eventType: SeasonalEventType): Record<string, Record<string, Record<string, number>>> {
        return this.seasonalEventConfig.eventGear[eventType.toLowerCase()];
    }

    /**
     * Get a dictionary of loot changes to apply to bots for a specific event e.g. Christmas/Halloween
     * @param eventName Name of event to get gear changes for
     * @returns bots with loot changes
     */
    protected getEventBotLoot(eventType: SeasonalEventType): Record<string, Record<string, Record<string, number>>> {
        return this.seasonalEventConfig.eventLoot[eventType.toLowerCase()];
    }

    /**
     * Get the dates each seasonal event starts and ends at
     * @returns Record with event name + start/end date
     */
    public getEventDetails(): ISeasonalEvent[] {
        return this.seasonalEventConfig.events;
    }

    /**
     * Look up quest in configs/quest.json
     * @param questId Quest to look up
     * @param event event type (Christmas/Halloween/None)
     * @returns true if related
     */
    public isQuestRelatedToEvent(questId: string, event: SeasonalEventType): boolean {
        const eventQuestData = this.questConfig.eventQuests[questId];
        if (eventQuestData?.season.toLowerCase() === event.toLowerCase()) {
            return true;
        }

        return false;
    }

    /**
     * Handle activating seasonal events
     */
    public enableSeasonalEvents(): void {
        if (this.currentlyActiveEvents) {
            const globalConfig = this.databaseService.getGlobals().config;
            for (const event of this.currentlyActiveEvents) {
                this.updateGlobalEvents(globalConfig, event);
            }
        }
    }

    /**
     * Force a seasonal event to be active
     * @param eventType Event to force active
     * @returns True if event was successfully force enabled
     */
    public forceSeasonalEvent(eventType: SeasonalEventType): boolean {
        const globalConfig = this.databaseService.getGlobals().config;
        const event = this.seasonalEventConfig.events.find((event) => SeasonalEventType[event.type] === eventType);
        if (!event) {
            this.logger.warning(`Unable to force event: ${eventType} as it cannot be found in events config`);
            return false;
        }
        this.updateGlobalEvents(globalConfig, event);

        return true;
    }

    /**
     * Store active events inside class array property `currentlyActiveEvents` + set class properties: christmasEventActive/halloweenEventActive
     */
    public cacheActiveEvents(): void {
        const currentDate = new Date();
        const seasonalEvents = this.getEventDetails();

        // reset existing data
        this.currentlyActiveEvents = [];

        // Add active events to array
        for (const event of seasonalEvents) {
            if (!event.enabled) {
                continue;
            }

            if (
                this.dateIsBetweenTwoDates(currentDate, event.startMonth, event.startDay, event.endMonth, event.endDay)
            ) {
                this.currentlyActiveEvents.push(event);
            }
        }
    }

    /**
     * Get the currently active weather season e.g. SUMMER/AUTUMN/WINTER
     * @returns Season enum value
     */
    public getActiveWeatherSeason(): Season {
        if (this.weatherConfig.overrideSeason !== null) {
            return this.weatherConfig.overrideSeason;
        }

        const currentDate = new Date();
        for (const seasonRange of this.weatherConfig.seasonDates) {
            if (
                this.dateIsBetweenTwoDates(
                    currentDate,
                    seasonRange.startMonth,
                    seasonRange.startDay,
                    seasonRange.endMonth,
                    seasonRange.endDay,
                )
            ) {
                return seasonRange.seasonType;
            }
        }

        this.logger.warning(this.localisationService.getText("season-no_matching_season_found_for_date"));

        return Season.SUMMER;
    }

    /**
     * Does the provided date fit between the two defined dates?
     * Excludes year
     * Inclusive of end date upto 23 hours 59 minutes
     * @param dateToCheck Date to check is between 2 dates
     * @param startMonth Lower bound for month
     * @param startDay Lower bound for day
     * @param endMonth Upper bound for month
     * @param endDay Upper bound for day
     * @returns True when inside date range
     */
    protected dateIsBetweenTwoDates(
        dateToCheck: Date,
        startMonth: number,
        startDay: number,
        endMonth: number,
        endDay: number,
    ): boolean {
        const eventStartDate = new Date(dateToCheck.getFullYear(), startMonth - 1, startDay);
        const eventEndDate = new Date(dateToCheck.getFullYear(), endMonth - 1, endDay, 23, 59);

        return dateToCheck >= eventStartDate && dateToCheck <= eventEndDate;
    }

    /**
     * Iterate through bots inventory and loot to find and remove christmas items (as defined in SeasonalEventService)
     * @param botInventory Bots inventory to iterate over
     * @param botRole the role of the bot being processed
     */
    public removeChristmasItemsFromBotInventory(botInventory: IInventory, botRole: string): void {
        const christmasItems = this.getChristmasEventItems();
        const equipmentSlotsToFilter = ["FaceCover", "Headwear", "Backpack", "TacticalVest"];
        const lootContainersToFilter = ["Backpack", "Pockets", "TacticalVest"];

        // Remove christmas related equipment
        for (const equipmentSlotKey of equipmentSlotsToFilter) {
            if (!botInventory.equipment[equipmentSlotKey]) {
                this.logger.warning(
                    this.localisationService.getText("seasonal-missing_equipment_slot_on_bot", {
                        equipmentSlot: equipmentSlotKey,
                        botRole: botRole,
                    }),
                );
            }

            const equipment: Record<string, number> = botInventory.equipment[equipmentSlotKey];
            botInventory.equipment[equipmentSlotKey] = Object.fromEntries(
                Object.entries(equipment).filter(([index]) => !christmasItems.includes(index)),
            );
        }

        // Remove christmas related loot from loot containers
        for (const lootContainerKey of lootContainersToFilter) {
            if (!botInventory.items[lootContainerKey]) {
                this.logger.warning(
                    this.localisationService.getText("seasonal-missing_loot_container_slot_on_bot", {
                        lootContainer: lootContainerKey,
                        botRole: botRole,
                    }),
                );
            }

            const tplsToRemove: string[] = [];
            const containerItems = botInventory.items[lootContainerKey];
            for (const tplKey of Object.keys(containerItems)) {
                if (christmasItems.includes(tplKey)) {
                    tplsToRemove.push(tplKey);
                }
            }

            for (const tplToRemove of tplsToRemove) {
                delete containerItems[tplToRemove];
            }

            // Get non-christmas items
            const nonChristmasTpls = Object.keys(containerItems).filter((tpl) => !christmasItems.includes(tpl));
            if (nonChristmasTpls.length === 0) {
                continue;
            }
            const intermediaryDict = {};

            for (const tpl of nonChristmasTpls) {
                intermediaryDict[tpl] = containerItems[tpl];
            }

            // Replace the original containerItems with the updated one
            botInventory.items[lootContainerKey] = intermediaryDict;
        }
    }

    /**
     * Make adjusted to server code based on the name of the event passed in
     * @param globalConfig globals.json
     * @param eventName Name of the event to enable. e.g. Christmas
     */
    protected updateGlobalEvents(globalConfig: IConfig, event: ISeasonalEvent): void {
        this.logger.success(this.localisationService.getText("season-event_is_active", event.type));
        this.christmasEventActive = false;
        this.halloweenEventActive = false;

        switch (event.type.toLowerCase()) {
            case SeasonalEventType.HALLOWEEN.toLowerCase():
                this.applyHalloweenEvent(event, globalConfig);
                break;
            case SeasonalEventType.CHRISTMAS.toLowerCase():
                this.applyChristmasEvent(event, globalConfig);
                break;
            case SeasonalEventType.NEW_YEARS.toLowerCase():
                this.applyNewYearsEvent(event, globalConfig);

                break;
            case SeasonalEventType.APRIL_FOOLS.toLowerCase():
                this.addGifterBotToMaps();
                this.addLootItemsToGifterDropItemsList();
                this.addEventGearToBots(SeasonalEventType.HALLOWEEN);
                this.addEventGearToBots(SeasonalEventType.CHRISTMAS);
                this.addEventLootToBots(SeasonalEventType.CHRISTMAS);
                this.addEventBossesToMaps(SeasonalEventType.HALLOWEEN);
                this.enableHalloweenSummonEvent();
                this.addPumpkinsToScavBackpacks();
                this.renameBitcoin();
                this.enableSnow();
                break;
            default:
                // Likely a mod event
                this.handleModEvent(event, globalConfig);
                break;
        }
    }

    protected applyHalloweenEvent(event: ISeasonalEvent, globalConfig: IConfig) {
        this.halloweenEventActive = true;

        globalConfig.EventType = globalConfig.EventType.filter((x) => x !== "None");
        globalConfig.EventType.push("Halloween");
        globalConfig.EventType.push("HalloweenIllumination");
        globalConfig.Health.ProfileHealthSettings.DefaultStimulatorBuff = "Buffs_Halloween";
        this.addEventGearToBots(event.type);
        this.adjustZryachiyMeleeChance();
        if (event.settings?.enableSummoning) {
            this.enableHalloweenSummonEvent();
            this.addEventBossesToMaps("halloweensummon");
        }
        if (event.settings?.zombieSettings?.enabled) {
            this.configureZombies(event.settings.zombieSettings);
        }
        if (event.settings?.removeEntryRequirement) {
            this.removeEntryRequirement(event.settings.removeEntryRequirement);
        }
        if (event.settings?.replaceBotHostility) {
            this.replaceBotHostility(this.seasonalEventConfig.hostilitySettingsForEvent.zombies);
        }
        if (event.settings?.adjustBotAppearances) {
            this.adjustBotAppearanceValues(event.type);
        }
        this.addPumpkinsToScavBackpacks();
        this.adjustTraderIcons(event.type);
    }

    protected applyChristmasEvent(event: ISeasonalEvent, globalConfig: IConfig) {
        this.christmasEventActive = true;

        if (event.settings?.enableChristmasHideout) {
            globalConfig.EventType = globalConfig.EventType.filter((x) => x !== "None");
            globalConfig.EventType.push("Christmas");
        }

        this.addEventGearToBots(event.type);
        this.addEventLootToBots(event.type);

        if (event.settings?.enableSanta) {
            this.addGifterBotToMaps();
            this.addLootItemsToGifterDropItemsList();
        }

        this.enableDancingTree();
        if (event.settings?.adjustBotAppearances) {
            this.adjustBotAppearanceValues(event.type);
        }

        const globals = this.databaseService.getGlobals();
        globals.config.Airdrop.AirdropViewType = "NewYear";

        const radioSettings = globals.config.AudioSettings.RadioBroadcastSettings;

        radioSettings.EnabledBroadcast = true;
        const christmasStation = radioSettings.RadioStations.find((x) => x.Station === "Christmas");
        christmasStation.Enabled = true;

        const rundansStation = radioSettings.RadioStations.find((x) => x.Station === "RunddansEvent");
        rundansStation.Enabled = true;

        globals.config.BTRSettings.MapsConfigs["TarkovStreets"].BtrSkin = "Tarcola";
        globals.config.BTRSettings.MapsConfigs["Woods"].BtrSkin = "Tarcola";

        globals.config.RunddansSettings.active = true;
        globals.config.RunddansSettings.activePVE = true;
    }

    protected applyNewYearsEvent(event: ISeasonalEvent, globalConfig: IConfig) {
        this.christmasEventActive = true;

        if (event.settings?.enableChristmasHideout) {
            globalConfig.EventType = globalConfig.EventType.filter((x) => x !== "None");
            globalConfig.EventType.push("Christmas");
        }

        this.addEventGearToBots(SeasonalEventType.CHRISTMAS);
        this.addEventLootToBots(SeasonalEventType.CHRISTMAS);

        if (event.settings?.enableSanta) {
            this.addGifterBotToMaps();
            this.addLootItemsToGifterDropItemsList();
        }

        this.enableDancingTree();

        if (event.settings?.adjustBotAppearances) {
            this.adjustBotAppearanceValues(SeasonalEventType.CHRISTMAS);
        }
    }

    protected adjustBotAppearanceValues(season: SeasonalEventType): void {
        const adjustments = this.seasonalEventConfig.botAppearanceChanges[season];
        if (!adjustments) {
            return;
        }

        for (const botTypeKey in adjustments) {
            const botDb = this.databaseService.getBots().types[botTypeKey];
            if (!botDb) {
                continue;
            }
            const botAppearanceAdjustments = adjustments[botTypeKey];
            for (const appearanceKey in botAppearanceAdjustments) {
                const weightAdjustments = botAppearanceAdjustments[appearanceKey];
                for (const itemKey in weightAdjustments) {
                    botDb.appearance[appearanceKey][itemKey] = weightAdjustments[itemKey];
                }
            }
        }
    }

    protected replaceBotHostility(hostilitySettings: Record<string, IAdditionalHostilitySettings[]>) {
        const locations = this.databaseService.getLocations();
        const ignoreList = this.locationConfig.nonMaps;
        const useDefault = hostilitySettings.default;

        for (const locationKey in locations) {
            if (ignoreList.includes(locationKey)) {
                continue;
            }

            const location: ILocation = locations[locationKey];
            if (!location?.base?.BotLocationModifier?.AdditionalHostilitySettings) {
                continue;
            }

            const newHostilitySettings = useDefault ? hostilitySettings.default : hostilitySettings[locationKey];
            if (!newHostilitySettings) {
                continue;
            }

            location.base.BotLocationModifier.AdditionalHostilitySettings = hostilitySettings.default;
        }
    }

    protected removeEntryRequirement(locationIds: string[]) {
        for (const locationId of locationIds) {
            const location = this.databaseService.getLocation(locationId);
            location.base.AccessKeys = [];
            location.base.AccessKeysPvE = [];
        }
    }

    public givePlayerSeasonalGifts(sessionId: string): void {
        if (this.currentlyActiveEvents) {
            for (const event of this.currentlyActiveEvents) {
                switch (event.type.toLowerCase()) {
                    case SeasonalEventType.CHRISTMAS.toLowerCase():
                        this.giveGift(sessionId, "Christmas2022");
                        break;
                    case SeasonalEventType.NEW_YEARS.toLowerCase():
                        this.giveGift(sessionId, "NewYear2023");
                        this.giveGift(sessionId, "NewYear2024");
                        break;
                }
            }
        }
    }

    /**
     * Force zryachiy to always have a melee weapon
     */
    protected adjustZryachiyMeleeChance(): void {
        this.databaseService.getBots().types.bosszryachiy.chances.equipment.Scabbard = 100;
    }

    /**
     * Enable the halloween zryachiy summon event
     */
    protected enableHalloweenSummonEvent(): void {
        this.databaseService.getGlobals().config.EventSettings.EventActive = true;
    }

    protected configureZombies(zombieSettings: IZombieSettings) {
        const infectionHalloween = this.databaseService.getGlobals().config.SeasonActivity.InfectionHalloween;
        infectionHalloween.DisplayUIEnabled = true;
        infectionHalloween.Enabled = true;

        for (const infectedLocationKey in zombieSettings.mapInfectionAmount) {
            const mappedLocations = this.getLocationFromInfectedLocation(infectedLocationKey);

            for (const locationKey of mappedLocations) {
                this.databaseService.getLocation(
                    locationKey.toLowerCase(),
                ).base.Events.Halloween2024.InfectionPercentage =
                    zombieSettings.mapInfectionAmount[infectedLocationKey];
            }

            this.databaseService.getGlobals().LocationInfection[infectedLocationKey] =
                zombieSettings.mapInfectionAmount[infectedLocationKey];
        }

        for (const locationId of zombieSettings.disableBosses) {
            this.databaseService.getLocation(locationId).base.BossLocationSpawn = [];
        }

        for (const locationId of zombieSettings.disableWaves) {
            this.databaseService.getLocation(locationId).base.waves = [];
        }

        const locationsWithActiveInfection = this.getLocationsWithZombies(zombieSettings.mapInfectionAmount);
        this.addEventBossesToMaps("halloweenzombies", locationsWithActiveInfection);
    }

    /**
     * Get location ids of maps with an infection above 0
     * @param locationInfections Dict of locations with their infection percentage
     * @returns Array of location ids
     */
    protected getLocationsWithZombies(locationInfections: Record<string, number>): string[] {
        const result: string[] = [];

        // Get only the locations with an infection above 0
        const infectionKeys = Object.keys(locationInfections).filter(
            (locationId) => locationInfections[locationId] > 0,
        );

        // Convert the infected location id into its generic location id
        for (const locationkey of infectionKeys) {
            result.push(...this.getLocationFromInfectedLocation(locationkey));
        }

        return result;
    }

    /**
     * BSG store the location ids differently inside `LocationInfection`, need to convert to matching location IDs
     * @param infectedLocationKey Key to convert
     * @returns Array of locations
     */
    protected getLocationFromInfectedLocation(infectedLocationKey: string): string[] {
        if (infectedLocationKey === "factory4") {
            return ["factory4_day", "factory4_night"];
        }

        if (infectedLocationKey === "Sandbox") {
            return ["sandbox", "sandbox_high"];
        }

        return [infectedLocationKey];
    }

    protected addEventWavesToMaps(eventType: string): void {
        const wavesToAddByMap = this.seasonalEventConfig.eventWaves[eventType.toLowerCase()];

        if (!wavesToAddByMap) {
            this.logger.warning(`Unable to add: ${eventType} waves, eventWaves is missing`);
            return;
        }
        const mapKeys = Object.keys(wavesToAddByMap) ?? [];
        const locations = this.databaseService.getLocations();
        for (const mapKey of mapKeys) {
            const wavesToAdd = mapKeys[mapKey];
            if (!wavesToAdd) {
                this.logger.warning(`Unable to add: ${eventType} wave to: ${mapKey}`);
                continue;
            }
            locations[mapKey].base.waves = [];
            locations[mapKey].base.waves.push(...wavesToAdd);
        }
    }

    /**
     * Add event bosses to maps
     * @param eventType Seasonal event, e.g. HALLOWEEN/CHRISTMAS
     * @param mapWhitelist OPTIONAL - Maps to add bosses to
     */
    protected addEventBossesToMaps(eventType: string, mapIdWhitelist?: string[]): void {
        const botsToAddPerMap = this.seasonalEventConfig.eventBossSpawns[eventType.toLowerCase()];
        if (!botsToAddPerMap) {
            this.logger.warning(`Unable to add: ${eventType} bosses, eventBossSpawns is missing`);
            return;
        }
        const mapKeys = Object.keys(botsToAddPerMap) ?? [];
        const locations = this.databaseService.getLocations();
        for (const mapKey of mapKeys) {
            const bossesToAdd = botsToAddPerMap[mapKey];
            if (!bossesToAdd) {
                this.logger.warning(`Unable to add: ${eventType} bosses to: ${mapKey}`);
                continue;
            }

            if (mapIdWhitelist && !mapIdWhitelist.includes(mapKey)) {
                continue;
            }

            for (const boss of bossesToAdd) {
                const mapBosses: IBossLocationSpawn[] = locations[mapKey].base.BossLocationSpawn;
                if (!mapBosses.some((bossSpawn) => bossSpawn.BossName === boss.BossName)) {
                    locations[mapKey].base.BossLocationSpawn.push(...bossesToAdd);
                }
            }
        }
    }

    /**
     * Change trader icons to be more event themed (Halloween only so far)
     * @param eventType What event is active
     */
    protected adjustTraderIcons(eventType: SeasonalEventType): void {
        switch (eventType.toLowerCase()) {
            case SeasonalEventType.HALLOWEEN.toLowerCase():
                this.httpConfig.serverImagePathOverride["./assets/images/traders/5a7c2ebb86f7746e324a06ab.png"] =
                    "./assets/images/traders/halloween/5a7c2ebb86f7746e324a06ab.png";
                this.httpConfig.serverImagePathOverride["./assets/images/traders/5ac3b86a86f77461491d1ad8.png"] =
                    "./assets/images/traders/halloween/5ac3b86a86f77461491d1ad8.png";
                this.httpConfig.serverImagePathOverride["./assets/images/traders/5c06531a86f7746319710e1b.png"] =
                    "./assets/images/traders/halloween/5c06531a86f7746319710e1b.png";
                this.httpConfig.serverImagePathOverride["./assets/images/traders/59b91ca086f77469a81232e4.png"] =
                    "./assets/images/traders/halloween/59b91ca086f77469a81232e4.png";
                this.httpConfig.serverImagePathOverride["./assets/images/traders/59b91cab86f77469aa5343ca.png"] =
                    "./assets/images/traders/halloween/59b91cab86f77469aa5343ca.png";
                this.httpConfig.serverImagePathOverride["./assets/images/traders/59b91cb486f77469a81232e5.png"] =
                    "./assets/images/traders/halloween/59b91cb486f77469a81232e5.png";
                this.httpConfig.serverImagePathOverride["./assets/images/traders/59b91cbd86f77469aa5343cb.png"] =
                    "./assets/images/traders/halloween/59b91cbd86f77469aa5343cb.png";
                this.httpConfig.serverImagePathOverride["./assets/images/traders/579dc571d53a0658a154fbec.png"] =
                    "./assets/images/traders/halloween/579dc571d53a0658a154fbec.png";
                break;
            case SeasonalEventType.CHRISTMAS.toLowerCase():
                // TODO: find christmas trader icons
                break;
        }

        this.databaseImporter.loadImagesAsync(
            `${this.databaseImporter.getSptDataPath()}images/`,
            ["traders"],
            ["/files/trader/avatar/"],
        );
    }

    /**
     * Add lootble items from backpack into patrol.ITEMS_TO_DROP difficulty property
     */
    protected addLootItemsToGifterDropItemsList(): void {
        const gifterBot = this.databaseService.getBots().types.gifter;
        for (const difficulty in gifterBot.difficulty) {
            gifterBot.difficulty[difficulty].Patrol.ITEMS_TO_DROP = Object.keys(
                gifterBot.inventory.items.Backpack,
            ).join(", ");
        }
    }

    /**
     * Read in data from seasonalEvents.json and add found equipment items to bots
     * @param eventName Name of the event to read equipment in from config
     */
    protected addEventGearToBots(eventType: SeasonalEventType): void {
        const botGearChanges = this.getEventBotGear(eventType);
        if (!botGearChanges) {
            this.logger.warning(this.localisationService.getText("gameevent-no_gear_data", eventType));

            return;
        }

        // Iterate over bots with changes to apply
        for (const bot in botGearChanges) {
            const botToUpdate = this.databaseService.getBots().types[bot.toLowerCase()];
            if (!botToUpdate) {
                this.logger.warning(this.localisationService.getText("gameevent-bot_not_found", bot));
                continue;
            }

            // Iterate over each equipment slot change
            const gearAmendmentsBySlot = botGearChanges[bot];
            for (const equipmentSlot in gearAmendmentsBySlot) {
                // Adjust slots spawn chance to be at least 75%
                botToUpdate.chances.equipment[equipmentSlot] = Math.max(
                    botToUpdate.chances.equipment[equipmentSlot],
                    75,
                );

                // Grab gear to add and loop over it
                const itemsToAdd = gearAmendmentsBySlot[equipmentSlot];
                for (const itemTplIdToAdd in itemsToAdd) {
                    botToUpdate.inventory.equipment[equipmentSlot][itemTplIdToAdd] = itemsToAdd[itemTplIdToAdd];
                }
            }
        }
    }

    /**
     * Read in data from seasonalEvents.json and add found loot items to bots
     * @param eventName Name of the event to read loot in from config
     */
    protected addEventLootToBots(eventType: SeasonalEventType): void {
        const botLootChanges = this.getEventBotLoot(eventType);
        if (!botLootChanges) {
            this.logger.warning(this.localisationService.getText("gameevent-no_gear_data", eventType));

            return;
        }

        // Iterate over bots with changes to apply
        for (const bot in botLootChanges) {
            const botToUpdate = this.databaseService.getBots().types[bot.toLowerCase()];
            if (!botToUpdate) {
                this.logger.warning(this.localisationService.getText("gameevent-bot_not_found", bot));
                continue;
            }

            // Iterate over each loot slot change
            const lootAmendmentsBySlot = botLootChanges[bot];
            for (const slotKey in lootAmendmentsBySlot) {
                // Grab loot to add and loop over it
                const itemTplsToAdd = lootAmendmentsBySlot[slotKey];
                for (const tpl in itemTplsToAdd) {
                    botToUpdate.inventory.items[slotKey][tpl] = itemTplsToAdd[tpl];
                }
            }
        }
    }

    /**
     * Add pumpkin loot boxes to scavs
     */
    protected addPumpkinsToScavBackpacks(): void {
        this.databaseService.getBots().types.assault.inventory.items.Backpack[
            ItemTpl.RANDOMLOOTCONTAINER_PUMPKIN_RAND_LOOT_CONTAINER
        ] = 400;
    }

    protected renameBitcoin(): void {
        const enLocale = this.databaseService.getLocales().global.en;
        enLocale[`${ItemTpl.BARTER_PHYSICAL_BITCOIN} Name`] = "Physical SPT Coin";
        enLocale[`${ItemTpl.BARTER_PHYSICAL_BITCOIN} ShortName`] = "0.2SPT";
    }

    /**
     * Set Khorovod(dancing tree) chance to 100% on all maps that support it
     */
    protected enableDancingTree(): void {
        const maps = this.databaseService.getLocations();
        for (const mapName in maps) {
            // Skip maps that have no tree
            if (["hideout", "base", "privatearea"].includes(mapName)) {
                continue;
            }

            const mapData: ILocation = maps[mapName];
            if (typeof mapData.base?.Events?.Khorovod?.Chance !== "undefined") {
                mapData.base.Events.Khorovod.Chance = 100;
                mapData.base.BotLocationModifier.KhorovodChance = 100;
            }
        }
    }

    /**
     * Add santa to maps
     */
    protected addGifterBotToMaps(): void {
        const gifterSettings = this.seasonalEventConfig.gifterSettings;
        const maps = this.databaseService.getLocations();
        for (const gifterMapSettings of gifterSettings) {
            const mapData: ILocation = maps[gifterMapSettings.map];
            // Dont add gifter to map twice
            if (mapData.base.BossLocationSpawn.some((boss) => boss.BossName === "gifter")) {
                continue;
            }

            mapData.base.BossLocationSpawn.push({
                BossName: "gifter",
                BossChance: gifterMapSettings.spawnChance,
                BossZone: gifterMapSettings.zones,
                BossPlayer: false,
                BossDifficult: "normal",
                BossEscortType: "gifter",
                BossEscortDifficult: "normal",
                BossEscortAmount: "0",
                ForceSpawn: true,
                spawnMode: ["regular", "pve"],
                Time: -1,
                TriggerId: "",
                TriggerName: "",
                Delay: 0,
                RandomTimeSpawn: false,
            });
        }
    }

    protected handleModEvent(event: ISeasonalEvent, globalConfig: IConfig): void {
        if (event.settings?.enableChristmasHideout) {
            globalConfig.EventType = globalConfig.EventType.filter((x) => x !== "None");
            globalConfig.EventType.push("Christmas");
        }

        if (event.settings?.enableHalloweenHideout) {
            globalConfig.EventType = globalConfig.EventType.filter((x) => x !== "None");
            globalConfig.EventType.push("Halloween");
            globalConfig.EventType.push("HalloweenIllumination");
        }

        if (event.settings?.addEventGearToBots) {
            this.addEventGearToBots(event.type);
        }
        if (event.settings?.addEventLootToBots) {
            this.addEventLootToBots(event.type);
        }

        if (event.settings?.enableSummoning) {
            this.enableHalloweenSummonEvent();
            this.addEventBossesToMaps("halloweensummon");
        }
        if (event.settings?.zombieSettings?.enabled) {
            this.configureZombies(event.settings.zombieSettings);
        }
        if (event.settings?.forceSeason) {
            this.weatherConfig.overrideSeason = event.settings.forceSeason;
        }

        if (event.settings?.adjustBotAppearances) {
            this.adjustBotAppearanceValues(event.type);
        }
    }

    /**
     * Send gift to player if they'e not already received it
     * @param playerId Player to send gift to
     * @param giftKey Key of gift to give
     */
    protected giveGift(playerId: string, giftKey: string): void {
        const gitftData = this.giftService.getGiftById(giftKey);
        if (!this.profileHelper.playerHasRecievedMaxNumberOfGift(playerId, giftKey, gitftData.maxToSendPlayer ?? 5)) {
            this.giftService.sendGiftToPlayer(playerId, giftKey);
        }
    }

    /**
     * Get the underlying bot type for an event bot e.g. `peacefullZryachiyEvent` will return `bossZryachiy`
     * @param eventBotRole Event bot role type
     * @returns Bot role as string
     */
    public getBaseRoleForEventBot(eventBotRole: string): string {
        return this.seasonalEventConfig.eventBotMapping[eventBotRole];
    }

    /**
     * Force the weather to be snow
     */
    public enableSnow(): void {
        this.weatherConfig.overrideSeason = Season.WINTER;
    }
}
