import { OBJECTTYPE_ID_STANDARD_SOBJECT, OBJECTTYPE_ID_CUSTOM_SOBJECT, 
    OBJECTTYPE_ID_CUSTOM_EXTERNAL_SOBJECT, OBJECTTYPE_ID_CUSTOM_SETTING, 
    OBJECTTYPE_ID_CUSTOM_METADATA_TYPE, OBJECTTYPE_ID_CUSTOM_EVENT,
    OBJECTTYPE_ID_KNOWLEDGE_ARTICLE, OBJECTTYPE_ID_CUSTOM_BIG_OBJECT } from '../data/orgcheck-api-data-objecttype';

export class SOQLQueryInformation {
    string;
    tooling;
    byPasses;
    queryMore;
    addDependenciesBasedOnField;
}

export class DailyApiRequestLimitInformation {
    percentage;
    isGreenZone;
    isYellowZone;
    isRedZone;
    yellowThresholdPercentage;
    redThresholdPercentage;
}

const DAILY_API_REQUEST_WARNING_THRESHOLD = 0.70; // =70%
const DAILY_API_REQUEST_FATAL_THRESHOLD = 0.90;   // =90%

const DEFINITION_OLD_API_VERSION = 3; // in years

export class OrgCheckSalesforceManager {

    /**
     * API Version used to make the connection
     */
    #apiVersion;

    /**
     * JSForce connection to your Salesforce org
     */
    #connection;


    /**
     * Timestamp of the last request we have made to Salesforce.
     * Why we do this? to better appreciate the limitInfo we have from the last request.
     * If the information is fresh then no need to ask again the API, if not we need to try calling.
     */
    #lastRequestToSalesforce;
    
    /**
     * Last ratio the Salesforce API gave us about the Daily API Request. 
     */
    #lastApiUsage;

    /**
     * Construct the connection manager from a ConnectionFactory (like JSForce) and a VFP accesstoken
     * 
     * @param {JsForce} jsConnectionFactory 
     * @param {string} accessToken 
     */
    constructor(jsConnectionFactory, accessToken) {
        const THIS_YEAR = new Date().getFullYear();
        const THIS_MONTH = new Date().getMonth() + 1;
        const SF_API_VERSION = 3 * (THIS_YEAR - 2022) + 53 + (THIS_MONTH <= 2 ? 0 : (THIS_MONTH <= 6 ? 1 : (THIS_MONTH <= 10 ? 2 : 3 )));

        this.#apiVersion = SF_API_VERSION;
        this.#connection = new jsConnectionFactory.Connection({
            accessToken: accessToken,
            version: SF_API_VERSION + '.0',
            maxRequest: '10000'
        });
        this.#lastRequestToSalesforce = undefined;
        this.#lastApiUsage = 0;
    }

    isEmpty(value) {
        if (!value) return true;
        if (value.length === 0) return true;
        if (value.trim && value.trim().length === 0) return true;
        return false;
    }

    ratioToPercentage(ratio, decimals) {
        return (ratio*100).toFixed(decimals);
    }

    /**
     * Is an API version is old or not?
     * @param version The given version number (should be an integer)
     * @param definition_of_old in Years (by default see DEFINITION_OLD_API_VERSION)
     */
    isVersionOld(version, definition_of_old = DEFINITION_OLD_API_VERSION) {
        // Compute age version in Years
        const age = (this.#apiVersion - version) / 3;
        if (age >= definition_of_old) return true;
        return false;
    }

    caseSafeId(id) {
        if (id && id.length === 18) return id.substr(0, 15);
        return id;
    }
    
    setupUrl(type, durableId, objectDurableId, objectType) {
        
        switch (type) {

            /*
              In case the type is from the DAPI, we only have the id and the type from the DAPI (not the 
                object information). so in this case we cannot point to the direct URL in Lightning Setup. 
                Let's give it a try by returning just '/' and the id...
            */
            case 'CustomField': // From DAPI 
            case 'Layout': // From DAPI 
                return `/${durableId}`;
            
            /*
              In the following section we have enought information go return the full URL
            */
            case 'field': { // Org Check specific
                switch (objectType) {
                    case OBJECTTYPE_ID_STANDARD_SOBJECT:
                    case OBJECTTYPE_ID_CUSTOM_SOBJECT:
                        return `/lightning/setup/ObjectManager/${objectDurableId}/FieldsAndRelationships/${durableId}/view`;
                    case OBJECTTYPE_ID_CUSTOM_BIG_OBJECT:
                        return `/lightning/setup/BigObjects/page?address=%2F${durableId}%3Fsetupid%3DBigObjects`;
                    case OBJECTTYPE_ID_CUSTOM_EVENT:
                        return `/lightning/setup/EventObjects/page?address=%2F${durableId}%3Fsetupid%3DEventObjects`;
                    case OBJECTTYPE_ID_CUSTOM_SETTING:
                        return `/lightning/setup/CustomSettings/page?address=%2F${durableId}%3Fsetupid%3DCustomSettings`;
                    case OBJECTTYPE_ID_CUSTOM_METADATA_TYPE:
                        return `/lightning/setup/CustomMetadata/page?address=%2F${durableId}%3Fsetupid%3DCustomMetadata`;
                    case OBJECTTYPE_ID_CUSTOM_EXTERNAL_SOBJECT:
                        return `/lightning/setup/ExternalObjects/page?address=%2F${durableId}%3Fsetupid%3DExternalObjects`;
                    default:
                        return `/${durableId}`;
                }
            }
            case 'layout': { // Org Check specific
                return `/lightning/setup/ObjectManager/${objectDurableId}/PageLayouts/${durableId}/view`;
            }
            case 'object': { // Org Check specific
                switch (objectType) {
                    case OBJECTTYPE_ID_STANDARD_SOBJECT:
                    case OBJECTTYPE_ID_CUSTOM_SOBJECT:
                        return `/lightning/setup/ObjectManager/${objectDurableId}/Details/view`;
                    case OBJECTTYPE_ID_CUSTOM_BIG_OBJECT:
                        return `/lightning/setup/BigObjects/page?address=%2F${objectDurableId}%3Fsetupid%3DBigObjects`;
                    case OBJECTTYPE_ID_CUSTOM_EVENT:
                        return `/lightning/setup/EventObjects/page?address=%2F${objectDurableId}%3Fsetupid%3DEventObjects`;
                    case OBJECTTYPE_ID_CUSTOM_SETTING:
                        return `/lightning/setup/CustomSettings/page?address=%2F${objectDurableId}%3Fsetupid%3DCustomSettings`;
                    case OBJECTTYPE_ID_CUSTOM_METADATA_TYPE:
                        return `/lightning/setup/CustomMetadata/page?address=%2F${objectDurableId}%3Fsetupid%3DCustomMetadata`;
                    case OBJECTTYPE_ID_CUSTOM_EXTERNAL_SOBJECT:
                        return `/lightning/setup/ExternalObjects/page?address=%2F${objectDurableId}%3Fsetupid%3DExternalObjects`;
                    default:
                        return `/${objectDurableId}`;
                }
            }
            case 'validation-rule': // Org Check specific
            case 'ValidationRule': { // From DAPI 
                return `/lightning/setup/ObjectManager/page?address=%2F${durableId}`;
            }
            case 'web-link': { // Org Check specific
                return `/lightning/setup/ObjectManager/${objectDurableId}/ButtonsLinksActions/${durableId}/view`;
            } 
            case 'record-type': { // Org Check specific
                return `/lightning/setup/ObjectManager/${objectDurableId}/RecordTypes/${durableId}/view`;
            }
            case 'apex-trigger': { // Org Check specific
                return '/lightning/setup/ObjectManager/${objectDurableId}/ApexTriggers/${durableId}/view';
            }            
            case 'field-set': { // Org Check specific
                return '/lightning/setup/ObjectManager/${objectDurableId}/FieldSets/${durableId}/view';
            }
            case 'user': { // Org Check specific
                return `/lightning/setup/ManageUsers/page?address=%2F${durableId}%3Fnoredirect%3D1%26isUserEntityOverride%3D1`;
            }
            case 'profile': { // Org Check specific
                return `/lightning/setup/EnhancedProfiles/page?address=%2F${durableId}`;
            }
            case 'permission-set': { // Org Check specific
                return `/lightning/setup/PermSets/page?address=%2F${durableId}`;
            }
            case 'permission-set-group': { // Org Check specific
                return `/lightning/setup/PermSetGroups/page?address=%2F${durableId}`;
            }
            case 'custom-label': // Org Check specific            
            case 'CustomLabel': { // From DAPI 
                return `/lightning/setup/ExternalStrings/page?address=%2F${durableId}`;
            }
            case 'flow': // Org Check specific
            case 'Flow': { // From DAPI 
                return `/builder_platform_interaction/flowBuilder.app?flowId=${durableId}`;
            }
            case 'visual-force-page': // Org Check specific
            case 'ApexPage': { // From DAPI 
                return `/lightning/setup/ApexPages/page?address=%2F${durableId}`;
            }
            case 'visual-force-component': // Org Check specific
            case 'ApexComponent': { // From DAPI 
                return `/lightning/setup/ApexComponent/page?address=%2F${durableId}`;
            }
            case 'static-resource': // Org Check specific
            case 'StaticResource': { // From DAPI 
                return `/lightning/setup/StaticResources/page?address=%2F${durableId}`;
            }
            //CustomSite
            //CustomTab
            case 'apex-class': // Org Check specific
            case 'ApexClass': { // From DAPI 
                return `/lightning/setup/ApexClasses/page?address=%2F${durableId}`;
            }
            // User
            //AuraDefinitionBundle
            default:
                return `/${durableId}`;
        }
    }
    
    splitIdsInBatches(ids, batchsize, callback) {
        if (batchsize <= 0) return;
        for (let i = 0; i < ids.length; i += batchsize) {
            callback('\''+ids.slice(i, Math.min(i + batchsize, ids.length)).join('\',\'')+'\'');
        }
    }

    getObjectType(apiName, isCustomSetting) {
        if (isCustomSetting === true) return OBJECTTYPE_ID_CUSTOM_SETTING;
        if (apiName.endsWith('__c')) return OBJECTTYPE_ID_CUSTOM_SOBJECT;
        if (apiName.endsWith('__x')) return OBJECTTYPE_ID_CUSTOM_EXTERNAL_SOBJECT;
        if (apiName.endsWith('__mdt')) return OBJECTTYPE_ID_CUSTOM_METADATA_TYPE;
        if (apiName.endsWith('__e')) return OBJECTTYPE_ID_CUSTOM_EVENT;
        if (apiName.endsWith('__ka')) return OBJECTTYPE_ID_KNOWLEDGE_ARTICLE;
        if (apiName.endsWith('__b')) return OBJECTTYPE_ID_CUSTOM_BIG_OBJECT;
        return OBJECTTYPE_ID_STANDARD_SOBJECT;
    }

    _watchDog__beforeRequest(errorCallback) {
        if (this.#lastRequestToSalesforce && Date.now() - this.#lastRequestToSalesforce <= 60000 && this.#lastApiUsage > DAILY_API_REQUEST_FATAL_THRESHOLD) {
            const error = new Error(
                `WATCH DOG: Daily API Request limit is ${this.ratioToPercentage(this.#lastApiUsage)}%, `+
                `and our internal threshold is ${this.ratioToPercentage(DAILY_API_REQUEST_FATAL_THRESHOLD)}%. `+
                'We stop there to keep your org safe.'
            );
            if (errorCallback) {
                errorCallback(error);
            } else {
                throw error;
            }
        }
    }

    _watchDog__afterRequest(errorCallback) {
        if (this.#connection.limitInfo && this.#connection.limitInfo.apiUsage) {
            const apiUsageUsed = this.#connection.limitInfo.apiUsage.used;
            const apiUsageMax = this.#connection.limitInfo.apiUsage.limit;
            this.#lastApiUsage = ( apiUsageUsed / apiUsageMax );
            this.#lastRequestToSalesforce = Date.now();
            this._watchDog__beforeRequest(errorCallback);
        }
    }

    /**
     * Get the lastest Daily API Usage from JSForce, and the level of confidence 
     * we have in this ratio to continue using org check.
     * 
     * @returns {DailyApiRequestLimitInformation} Percentage of the daily api usage and other flags to see if that percentage is good or bad.
     */
    getDailyApiRequestLimitInformation() {
        const info = new DailyApiRequestLimitInformation();
        info.percentage = this.ratioToPercentage(this.#lastApiUsage, 3);
        if (this.#lastApiUsage > DAILY_API_REQUEST_FATAL_THRESHOLD) info.isRedZone = true;
        else if (this.#lastApiUsage > DAILY_API_REQUEST_WARNING_THRESHOLD) info.isYellowZone = true;
        else info.isGreenZone = true;
        info.yellowThresholdPercentage = DAILY_API_REQUEST_WARNING_THRESHOLD;
        info.redThresholdPercentage = DAILY_API_REQUEST_FATAL_THRESHOLD;
        return info;
    }

    /**
     * Method to call a list of SOQL queries (tooling or not)
     * 
     * @param {Array<SOQLQueryInformation>} queries 
     */
    async soqlQuery(queries) {
        this._watchDog__beforeRequest();
        const promises = [];
        queries.forEach(q => {
            const queryPromise = new Promise((resolve, reject) => {
                const conn = q.tooling === true ? this.#connection.tooling : this.#connection;
                const records = [];
                const recursive_query = (e, d) => {
                    this._watchDog__afterRequest(reject);
                    if (e) { 
                        if (q.byPasses && q.byPasses.includes(e.errorCode)) {
                            resolve();
                        } else {
                            e.context = { 
                                when: 'While creating a promise to call a SOQL query.',
                                what: {
                                    queryMore: q.queryMore,
                                    queryString: q.string,
                                    queryUseTooling: q.tooling
                                }
                            };
                            reject(e);
                        }
                    } else {
                        records.push(... d.records);
                        if (d.done === true) {
                            resolve({ records: records });
                        } else {
                            conn.queryMore(d.nextRecordsUrl, recursive_query);
                        }
                    }
                }
                conn.query(q.string, recursive_query);
            });
            if (q.addDependenciesBasedOnField) {
                promises.push(queryPromise
                    .then((results) => {
                        // Getting the Ids for DAPI call
                        const ids = results.records.map((record) => this.caseSafeId(record[q.addDependenciesBasedOnField]));
                        // We are going to split the DAPI calls into batches for <n> ids at the same time
                        const dapiPromises = [];
                        this.splitIdsInBatches(ids, 50, (subids) => {
                            dapiPromises.push(new Promise((resolve, reject) => {
                                this.#connection.tooling.query(
                                    'SELECT MetadataComponentId, MetadataComponentName, MetadataComponentType, '+
                                        'RefMetadataComponentId, RefMetadataComponentName, RefMetadataComponentType '+
                                    'FROM MetadataComponentDependency '+
                                    `WHERE (RefMetadataComponentId IN (${subids}) OR MetadataComponentId IN (${subids}))`,
                                    (e, d) => {
                                        this._watchDog__afterRequest(reject);
                                        if (e) {
                                            e.context = { 
                                                when: 'While getting the dependencies from DAPI',
                                                what: {
                                                    allIds: ids,
                                                    concernedIds: subids
                                                }
                                            };
                                            reject(e);
                                        } else {
                                            resolve(d.records.map((e) => { return {
                                                id: this.caseSafeId(e.MetadataComponentId),
                                                name: e.MetadataComponentName, 
                                                type: e.MetadataComponentType,
                                                url: this.setupUrl(e.MetadataComponentType, e.MetadataComponentId),
                                                refId: this.caseSafeId(e.RefMetadataComponentId), 
                                                refName: e.RefMetadataComponentName,
                                                refType: e.RefMetadataComponentType,
                                                refUrl: this.setupUrl(e.RefMetadataComponentType, e.RefMetadataComponentId),
                                            }}));
                                        }
                                    }
                                );
                            }));
                        });
                        return Promise.all(dapiPromises)
                            .then((allDependenciesResults) => { 
                                // We are going to append the dependencies in the results
                                results.allDependencies = [];
                                // We parse all the batches/results from the DAPI
                                allDependenciesResults.forEach((dependencies) => {
                                    if (dependencies) {
                                        // Merge them into one array
                                        results.allDependencies.push(... dependencies);
                                    }
                                });
                                // Return the altered results
                                return results;
                            })
                            .catch((error) => {
                                console.error('Issue while parsing results from DAPI', error);
                            });
                    })
                    .catch((error) => {
                        console.error('Issue while accessing DAPI', error);
                    })
                );
            } else {
                promises.push(queryPromise);
            }
        });
        return Promise.all(promises);
    }

    /*
    https://github.com/SalesforceLabs/OrgCheck/blob/main/build/src/javascript/orgcheck/OrgCheck.Salesforce.js#L298
    */
    async readMetadata(metadatas) {
        this._watchDog__beforeRequest();
        return new Promise((resolve, reject) => {
            // First, if the metadatas contains an item with member='*' we want to list for this type and substitute the '*' with the fullNames
            Promise.all(
                metadatas
                    .filter(m => m.members.includes('*'))
                    .map(m => new Promise((resolve, reject) => { 
                        this.#connection.metadata.list([{type: m.type}], this.#connection.version, (error, members) => {
                            if (error) {
                                reject(Object.assign(error, { context: { 
                                    when: 'While calling a metadata api list.',
                                    what: { type: m.type }
                                }}));
                            } else {
                                // clear the members (remove the stars)
                                m.members = m.members.filter(b => b !== '*'); // 'metadatas' will be altered!
                                // add the fullNames 
                                if (members) (Array.isArray(members) ? members : [ members ]).forEach(f => { m.members.push(f.fullName); });
                                resolve();
                            }
                        });
                    })))
            .then(() => { 
                // At this point, no more wildcard, only types and legitime member values in 'metadatas'.
                // Second, we want to read the metatda for these types and members
                const promises = [];
                metadatas.forEach(m => {
                    while (m.members.length > 0) {
                        const membersMax10 = m.members.splice(0, 10); // get the first 10 items of the members, and members will no longer include them 
                        promises.push(new Promise((resolve, reject) => { 
                            this.#connection.metadata.read(m.type, membersMax10, (error, results) => {
                                if (error) {
                                    reject(Object.assign(error, { context: { 
                                        when: 'While calling a metadata api read.',
                                        what: { type: m.type, members: membersMax10 }
                                    }}));   
                                } else {
                                    resolve({ type: m.type, members: Array.isArray(results) ? results : [ results ] });
                                }
                            });
                        }));
                    }
                });
                Promise.all(promises)
                    .then((results) => {
                        const response = {};
                        results.forEach(r => {
                            const m = response[r.type] || [];
                            m.push(...r.members);
                            response[r.type] = m;
                        });
                        return response;
                    })
                    .catch(reject)
                    .then(resolve);
                })
                .catch(reject); // in case some of the list went wrong!!
        });
    }

    async readMetadataAtScale(type, ids, byPasses) {
        this._watchDog__beforeRequest();
        return new Promise((resolve, reject) => {
            const compositeRequestBodies = [];
            let currentCompositeRequestBody;
            const BATCH_MAX_SIZE = 25; // Composite can't handle more than 25 records per request
            ids.forEach((id) => {
                if (!currentCompositeRequestBody || currentCompositeRequestBody.compositeRequest.length === BATCH_MAX_SIZE) {
                    currentCompositeRequestBody = {
                        allOrNone: false,
                        compositeRequest: []
                    };
                    compositeRequestBodies.push(currentCompositeRequestBody);
                }
                currentCompositeRequestBody.compositeRequest.push({ 
                    url: '/services/data/v'+this.#connection.version+'/tooling/sobjects/' + type + '/' + id, 
                    method: 'GET',
                    referenceId: id
                });
            });
            const promises = [];
            compositeRequestBodies.forEach((requestBody) => {
                promises.push(new Promise((r, e) => {
                    this.#connection.request({
                            url: '/services/data/v'+this.#connection.version+'/tooling/composite', 
                            method: 'POST',
                            body: JSON.stringify(requestBody),
                            headers: { 'Content-Type': 'application/json' }
                        }, (error, response) => { 
                            this._watchDog__afterRequest(e);
                            if (error) {
                                error.context = { 
                                    when: 'While creating a promise to call the Tooling Composite API.',
                                    what: {
                                        type: metadataInformation.type,
                                        ids: metadataInformation.ids,
                                        body: requestBody
                                    }
                                };
                                e(error); 
                            } else {
                                r(response); 
                            }
                        }
                    );
                }));
            });
            Promise.all(promises)
                .then((results) => {
                    const records = [];
                    results.forEach((result) => {
                        result.compositeResponse.forEach((response) => {
                            if (response.httpStatusCode === 200) {
                                records.push(response.body);
                            } else {
                                const errorCode = response.body[0].errorCode;
                                if (byPasses && byPasses.includes(errorCode) === false) {
                                    const error = new Error();
                                    error.context = { 
                                        when: 'After receiving a response with bad HTTP status code.',
                                        what: {
                                            type: type,
                                            ids: ids,
                                            body: response.body
                                        }
                                    };
                                    reject(error);
                                }
                            }
                        });
                    });
                    resolve(records);
                })
                .catch(reject);
        });
    }

    /**
     * Method to get the list of sobjects
     */
    async describeGlobal() {
        this._watchDog__beforeRequest();
        return new Promise((resolve, reject) => {
            this.#connection.describeGlobal((e, d) => {
                this._watchDog__afterRequest(reject);
                if (e) reject(e); else resolve(d.sobjects);
            });
        });
    }

    /**
     * Method to describe one particular sobject
     * 
     * @param {string} sobjectDevName 
     */
    async describe(sobjectDevName) {
        this._watchDog__beforeRequest();
        return new Promise((resolve, reject) => {
            // describeSObject() method is not cached (compare to describe() method))
            this.#connection.describeSObject(sobjectDevName, (e, d) => {
                this._watchDog__afterRequest(reject);
                if (e) reject(e); else resolve(d);
            });
        });
    }
    
    /**
     * Method to get the record count (recycle bin included) of one particular sobject
     * 
     * @param {string} sobjectDevName 
     */
    async recordCount(sobjectDevName) {
        this._watchDog__beforeRequest();
        return new Promise((resolve, reject) => {
            this.#connection.request({ 
                url: '/services/data/v'+this.#connection.version+'/limits/recordCount?sObjects='+sobjectDevName,
                method: 'GET'
            }, (e, r) => {
                this._watchDog__afterRequest(reject);
                if (e) reject(e); else resolve((Array.isArray(r?.sObjects) && r?.sObjects.length == 1) ? r?.sObjects[0].count : 0);
            });
        });
    }
}