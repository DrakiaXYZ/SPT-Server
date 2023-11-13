import { IncomingMessage } from "node:http";
import { injectAll, injectable } from "tsyringe";

import { DynamicRouter, Router, StaticRouter } from "@spt-aki/di/Router";

@injectable()
export class HttpRouter
{
    constructor(
        @injectAll("StaticRoutes") protected staticRouters: StaticRouter[],
        @injectAll("DynamicRoutes") protected dynamicRoutes: DynamicRouter[],
    )
    {}

    protected groupBy<T>(list: T[], keyGetter: (t: T) => string): Map<string, T[]>
    {
        const map: Map<string, T[]> = new Map();
        for (const item of list)
        {
            const key = keyGetter(item);
            const collection = map.get(key);
            if (!collection)
            {
                map.set(key, [item]);
            }
            else
            {
                collection.push(item);
            }
        }
        return map;
    }

    public getResponse(req: IncomingMessage, info: any, sessionID: string): string
    {
        const wrapper: ResponseWrapper = new ResponseWrapper("");
        let url = req.url;

        // remove retry from url
        if (url?.includes("?retry="))
        {
            url = url.split("?retry=")[0];
        }
        const handled = this.handleRoute(url, info, sessionID, wrapper, this.staticRouters, false);
        if (!handled)
        {
            this.handleRoute(url, info, sessionID, wrapper, this.dynamicRoutes, true);
        }

        // TODO: Temporary hack to change ItemEventRouter response sessionID binding to what client expects
        if (wrapper.output?.includes("\"profileChanges\":{"))
        {
            wrapper.output = wrapper.output.replace(sessionID, `pmc${sessionID}`);
        }

        return wrapper.output;
    }

    protected handleRoute(
        url: string,
        info: any,
        sessionID: string,
        wrapper: ResponseWrapper,
        routers: Router[],
        dynamic: boolean,
    ): boolean
    {
        let matched = false;
        for (const route of routers)
        {
            if (route.canHandle(url, dynamic))
            {
                if (dynamic)
                {
                    wrapper.output = (route as DynamicRouter).handleDynamic(url, info, sessionID, wrapper.output);
                }
                else
                {
                    wrapper.output = (route as StaticRouter).handleStatic(url, info, sessionID, wrapper.output);
                }
                matched = true;
            }
        }
        return matched;
    }
}

class ResponseWrapper
{
    constructor(public output: string)
    {}
}
