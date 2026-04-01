import { describe, it, expect } from 'vitest'
import { formatDataWeave } from '../dataweave-formatter-v2'
import { parse, ParseError } from '../dw-parser'

const FULL_PRODUCTION_SCRIPT = `%dw 2.0
output application/json

import * from dw::core::Strings
import * from dw::Runtime
import * from dwl::common

//var NOTES__C_ID = "Z001" SM-1185
var languagePriority = (vars.agLanguages default []) ++ defaultISOLanguagePriority filter $ != null

var nullChar = "\u{2400}"

fun nullBoolean(b: Boolean | Null) = do {
    if(b != null and b) (
        true
    ) else (
        false
    )
}

fun mapRegion(regionMapping, country, region) = do {
    if(country == null or region == null) (
        null
    ) else if(country == nullChar or region == nullChar) (
        nullChar
    ) else (
        regionMapping[country][region]
    )
}

fun mapLanguage(languageMapping, language) = do {
    if(language == null) (
        null
    ) else if(language == nullChar) (
        nullChar
    ) else (
        languageMapping[language]
    )
}

fun compositeRequestStage(method, sObject, externalId, referenceId, records: Array) = do {
    var r = records filter $ != null
    ---
    if(r != null and !isEmpty(r)) (
        [{
            method: method,
            url: "$(p("sf.apiBasePath"))/composite/sobjects/$(sObject)/$(externalId)",
            referenceId : referenceId,
            body:{
                allOrNone: true,
                records: r
            }
        }]
    ) else (
        []
    )
}

fun compositeRequestStageDelete(referenceId, recordIds: Array<String>) = do {
    if (not isEmpty(recordIds)) (
        [
            {
                method: "DELETE",
                url: "$(p("sf.apiBasePath"))/composite/sobjects?ids=$(recordIds joinBy ",")",
                referenceId: referenceId
            }
        ]
    ) else (
        []
    )
}

fun getAccountBySapId(accs, id, salesOrg, distChan) = (accs filter $.SAP_ID__c == id and $.salesOrg == salesOrg and $.distChan == distChan)[0]

fun sapIdToAccountId(sapId, salesOrg, distChan) = (vars.accountIds filter ((account) ->
    account.salesOrg == salesOrg and
    account.distChan == distChan and
    account.SAP_ID__c == sapId
))[0].Id

var existingKeys = vars.orderItems map $.Key__c

var deliveryGroup = vars.cdmOrder.deliveryGroups[0]
var sapId = deliveryGroup.salesOrderSapId
var salesOrg = deliveryGroup.salesOrganization
var branch = deliveryGroup.branch
var distChan = deliveryGroup.distributionChannel
var odg = getOrderDeliveryGroup(vars.orderDeliveryGroups, sapId, salesOrg, branch, distChan)
var odgNumber = odg.OrderDeliveryGroupNumber

var agSapId = (deliveryGroup.partners filter ($.partnerFunction == 'AG'))[0].businessPartnerId
var agAcc = getAccountBySapId(vars.accountIds, agSapId, salesOrg, distChan)

fun getProduct2Id(salesOrg, distChan, materialId) = (vars.product2 filter $.SalesOrganization__c == salesOrg and $.DistributionChannel__c == distChan and $.MaterialCode__c == materialId)[0].Id
fun getProduct2IdByName(prodName) = (vars.product2 filter (($.Name == prodName) and isBlank($.MaterialCode__c)))[0].Id

var orderItems = deliveryGroup.items map do {
    var key = "$(vars.order.number)|$(odgNumber)|$(leftPad($.salesOrderItemPositionKey, 6, "0"))"
    var sfItem = (vars.orderItems filter $.Key__c == key)[0]
    var quantity = $.confdDelivQtyInOrderQtyUnit default $.requestedQuantity.amount
    var updateItemStatus = (nullBoolean($.structureTransmissionControl.action.tagCancellation)
                        or nullBoolean($.structureTransmissionControl.action.update)
                        or nullBoolean($.structureTransmissionControl.action.create)
                        or nullBoolean($.structureTransmissionControl.action.save)
                        // SM-859 BEGIN
                        or
                        ( nullBoolean(deliveryGroup.structureTransmissionControl.action.save)
                          and nullBoolean(deliveryGroup.structureTransmissionControl.dataAvailability.SECC)
                          and not (["18", "20", "24", "25"] contains deliveryGroup.deliveryBlock))
                        // SM-859 END
                        or sfItem.OrderStatus__c == "NEW")
                        and sfItem.OrderStatus__c != "CANCELLED_CUSTOMER"


    var sfRejectionReasons = vars.rejectionReasonPicklistValues filter $.IsActive map $.Value
    var itemIsCancelled = nullBoolean($.structureTransmissionControl.action.tagCancellation)
    var reasonCodeIsSfRelevant = (sfRejectionReasons contains $.rejectionInfo.reasonCode) and itemIsCancelled

    var orderItemStatus =
      // SM-1493 BEGIN
      if (itemIsCancelled and $.rejectionInfo.reasonCode == "89") "CHANGED_KWS"
      // SM-1493 END

      else if(reasonCodeIsSfRelevant) "CANCELLED_KWS"

      // SM-859 BEGIN
      else if ( nullBoolean(deliveryGroup.structureTransmissionControl.action.save)
                and nullBoolean(deliveryGroup.structureTransmissionControl.dataAvailability.SECC)
                and not (["18", "20", "24", "25"] contains deliveryGroup.deliveryBlock)) "ACCEPTED"
      // SM-859 END

      else if(nullBoolean($.structureTransmissionControl.action.update)) "CHANGED_KWS"
      else if(nullBoolean($.structureTransmissionControl.action.create)) "CREATED"
      else if (sfItem.OrderStatus__c == "NEW") "CREATED"
      else sfItem.OrderStatus__c default "CREATED"
    //var orderItemDescription = getTextForSf($.texts, $.sapTexts, NOTES__C_ID, languagePriority) SM-1185
    ---
    {
        attributes: {
            "type": "OrderItem"
        },
        Key__c: key,
        OrderDeliveryGroupId: odg.Id,
        SAPOrderPositionKey__c: leftPad($.salesOrderItemPositionKey, 6, "0"),
        OrderId: vars.order.id,
        //Description: orderItemDescription, SM-1185
        //Notes__c: orderItemDescription, SM-1185
        //TotalLineAmount: $.netAmount,
        UnitPrice: $.unitPrice default 0,
        Delivery_Priority__c: $.deliveryPriority,
        SalesDocumentPositionType__c: $.salesOrderItemCategory,
        PartnerProductId__c: $.partnerMaterial,
        Quantity: if (quantity <= 0) 1 else quantity,
        BuyerQuantity__c: $.requestedQuantity.amount,
        BuyerQuantityUom__c: $.requestedQuantity.unitCode,
        PricingDate__c: $.pricingDate as Date default null,
        "Type": "Order Product",
        (if(existingKeys contains key)
            null
        else
            Product2Id: getProduct2Id(deliveryGroup.salesOrganization, deliveryGroup.distributionChannel, $.material)),
        (if(existingKeys contains key)
            null
        else
            ListPrice: $.netPriceAmount default 0),
        NegotiatedDiscountCondition__c: null,
        NegotiatedDiscountValue__c: null,
        IntegrationStatus__c: "SUCCESS",
        DeliveryStatus__c: if(nullBoolean($.structureTransmissionControl.action.tagCancellation)) "-"
            else if ($.deliveryStatus == 'B') "PARTIAL_DELIVERY"
            else if ($.deliveryStatus == 'C') "IN_DELIVERY"
            else "-",

        (TechnicalRejectionReason__c: $.rejectionInfo.reasonCode) if(itemIsCancelled),
        (RejectionReason__c: $.rejectionInfo.reasonCode) if(reasonCodeIsSfRelevant),
        (TechnicalRejectionReason__c: null) if(not itemIsCancelled),
        (RejectionReason__c: null) if(not itemIsCancelled),

        (OrderStatus__c: orderItemStatus) if(updateItemStatus)
    }
}


var orderHeaderAdjustmentLineItems = (deliveryGroup.conditions map ((cnd, idx) -> do {
    var sfPromotion = (vars.promotions filter (($.Country__c == agAcc.BillingAddress.countryCode) and ($.SalesOrganization__c == salesOrg) and ($.IsHeaderCondition__c as Boolean == true) and ($.ConditionType__c == cnd.conditionType)))[0]
    var key = try(() -> "$(vars.order.number)|$(odgNumber)|$(sfPromotion.DisplayName)") orElse null
    var sfItem = (vars.orderItems filter $.Key__c == key)[0]
    ---
    {
        attributes: {
            "type": "OrderItem"
        },
        (Id: sfItem.Id) if (sfItem != null),
        Key__c: key,
        OrderId: vars.order.id,
        OrderDeliveryGroupId: odg.Id,
        "Type": "Delivery Charge",
        (Product2Id: getProduct2IdByName(sfPromotion.ConditionType__c)) if (not (existingKeys contains key)),
        ChargeConditionType__c: sfPromotion.ConditionType__c,
        ConditionCounter__c: cnd.counter,
        ChargePercentage__c: if (cnd.calculationType == "A") (cnd.percentageAdjustment) else (null),
        UnitPrice: cnd.absoluteAdjustment,
        (ListPrice: 0.0) if (not (existingKeys contains key)),
        Quantity: 1,
        IntegrationStatus__c: "SUCCESS",
        OrderStatus__c: "CREATED"
    }
})) filter ($.Key__c != null)

var usedOrderHeaderAdjustmentLineItemIds = (orderHeaderAdjustmentLineItems.Id default []) filter ($ != null)
var outdatedOrderHeaderAdjustmentLineItemIds = ((vars.orderItems filter ($."Type" == "Delivery Charge")) filter (not (usedOrderHeaderAdjustmentLineItemIds contains $.Id))).Id default []

var orderItemAdjustmentLineItems = flatten(
    deliveryGroup.items map ((itm, idx) -> do {
        var key = "$(vars.order.number)|$(odgNumber)|$(leftPad(itm.salesOrderItemPositionKey, 6, "0"))"
        var sfItem = (vars.orderItems filter $.Key__c == key)[0]
        ---
        (itm.conditions map ((cnd, iidx) -> do {
            var sfPromotions = (vars.promotions filter (($.Country__c == agAcc.BillingAddress.countryCode) and ($.SalesOrganization__c == salesOrg) and ($.IsHeaderCondition__c as Boolean == false) and ($.ConditionType__c == cnd.conditionType)))
            var sfOiAli = (vars.orderItemAdjustmentLineItems filter (($.OrderItemId == sfItem.Id) and ($.Counter__c as Number == cnd.counter as Number) and ($.AdjustmentCause.ConditionType__c == cnd.conditionType)))[0]
            var sfPromotion = ((sfPromotions filter ($.Id == sfOiAli.AdjustmentCauseId)) ++ sfPromotions)[0]
            var isPercentageAdjustment = (cnd.calculationType == "A") or (cnd.percentageAdjustment != null)
            var isAbsoluteAdjustment = (cnd.calculationType == "C") or (cnd.absoluteAdjustment != null)
            ---
            {
                attributes: {
                    "type": "OrderItemAdjustmentLineItem"
                },
                (Id: sfOiAli.Id) if (sfOiAli != null),
                (OrderItem: {
                    Key__c: sfItem.Key__c
                }) if (sfItem != null),
                AdjustmentCauseId: sfPromotion.Id,
                Counter__c: cnd.counter,
                AdjustmentSource: "Promotion",
                AdjustmentType: if (isAbsoluteAdjustment) ("AdjustmentAmount") else if (isPercentageAdjustment) ("AdjustmentPercentage") else (null),
                AdjustmentValue: if (isAbsoluteAdjustment) (cnd.absoluteAdjustment) else if (isPercentageAdjustment) (cnd.percentageAdjustment) else (null),
                Amount: cnd.absoluteAdjustment,
                Name: sfPromotion.ConditionType__c
            }
        })) filter (($.AdjustmentCauseId != null) and ($.AdjustmentType != null))
    })
)

var usedOrderItemAdjustmentLineItemIds = (orderItemAdjustmentLineItems.Id default []) filter ($ != null)
var outdatedOrderItemAdjustmentLineItemIds = (vars.orderItemAdjustmentLineItems filter (not (usedOrderItemAdjustmentLineItemIds contains $.Id))).Id default []

var orderItemTaxLineItems = flatten(
    deliveryGroup.items map ((itm, idx) -> do {
        var key = "$(vars.order.number)|$(odgNumber)|$(leftPad(itm.salesOrderItemPositionKey, 6, "0"))"
        var sfItem = (vars.orderItems filter $.Key__c == key)[0]
        ---
        ((itm.conditions filter ($.conditionType == "MWST")) map ((cnd, iidx) -> do {
            var sfOiTli = (vars.orderItemTaxLineItems filter (($.OrderItemId == sfItem.Id) and ($.Counter__c as Number == cnd.counter as Number)))[0]
            ---
            {
                attributes: {
                    "type": "OrderItemTaxLineItem"
                },
                (Id: sfOiTli.Id) if (sfOiTli != null),
                (OrderItem: {
                    Key__c: sfItem.Key__c
                }) if (sfItem != null),
                Counter__c: cnd.counter,
                Type: "Actual",
                TaxEffectiveDate: itm.pricingDate as Date default null,
                Rate: cnd.percentageAdjustment,
                Amount: cnd.absoluteAdjustment,
                Name: "VAT"
            }
        })) filter (($.Rate != null) or ($.Amount != null))
    })
)

var usedOrderItemTaxLineItemIds = (orderItemTaxLineItems.Id default []) filter ($ != null)
var outdatedOrderItemTaxLineItemIds = (vars.orderItemTaxLineItems filter (not (usedOrderItemTaxLineItemIds contains $.Id))).Id default []

var odgProxies = vars.cdmOrder.deliveryGroups map {
    attributes: {
        "type": "OrderDeliveryGroupProxy__c"
    },
    Name: "$(vars.order.number)|$(odgNumber)|OrderDeliveryGroupProxy__c",
    CurrencyIsoCode: vars.cdmOrder.transactionCurrency
}

var temporaryAddresses = deliveryGroup.partners filter ((partner) -> partnerHasTemporaryAddress(vars.bpRelationTable, vars.accountIds, partner, deliveryGroup.salesOrganization, deliveryGroup.distributionChannel)) map ((partner) ->
do{
    var key = sapTemporaryAddressKey(vars.order.number, odgNumber, partner.partnerFunction)
    var addressMask = partner.addressMask
    ---
    {
        attributes: {
            "type": "SapTemporaryAddress__c"
        },
        Key__c: key,
        AddressFormat__c: addressMask.addressFormat,
        AddressName1__c: addressMask.addressName1,
        AddressName2__c: addressMask.addressName2,
        AddressName3__c: addressMask.addressName3,
        AddressName4__c: addressMask.addressName4,
        HouseNumber__c: addressMask.houseNumber,
        StreetPrefix1__c: addressMask.streetPrefix1,
        StreetPrefix2__c: addressMask.streetPrefix2,
        Street__c: addressMask.street,
        StreetSuffix1__c: addressMask.streetSuffix1,
        StreetSuffix2__c: addressMask.streetSuffix2,
        District__c: addressMask.district,
        City__c: addressMask.city,
        PostalCodeCity__c: addressMask.postalCodeCity,
        PoBoxNumber__c: addressMask.poBoxNumber,
        PostalCodePoBox__c: addressMask.postalCodePoBox,
        StateCodeEnhanced__c: mapRegion(vars.regionMapping, addressMask.countryCode, addressMask.stateCode),
        CountryCode__c: addressMask.countryCode,
        CorrespondenceLanguage__c: mapLanguage(vars.languageMapping, addressMask.correspondenceLanguage),
        Email__c: addressMask.email,
        FaxCountryCode__c: addressMask.faxCountryCode,
        FaxAreaCode__c: addressMask.faxAreaCode,
        FaxSubscriberNumber__c: addressMask.faxSubscriberNumber,
        FaxExtension__c: addressMask.faxExtension,
        PhoneCountryCode__c: addressMask.phoneCountryCode,
        MobileCountryCode__c: addressMask.mobileCountryCode,
        PhoneAreaCode__c: addressMask.phoneAreaCode,
        MobileAreaCode__c: addressMask.mobileAreaCode,
        PhoneSubscriberNumber__c: addressMask.phoneSubscriberNumber,
        MobileSubscriberNumber__c: addressMask.mobileSubscriberNumber,
        PhoneExtension__c: addressMask.phoneExtension,
        MobileExtension__c: addressMask.mobileExtension,
        TaxJurisdiction__c: addressMask.taxJurisdiction,
        TransportationZone__c: addressMask.transportationZone
    }
})

var orderRoles =
do
{
    var prefix = "$(vars.order.number)|$(odgNumber)"
    ---
    deliveryGroup.partners map ((partner) ->
    {
        attributes: {
            "type": "OrderRole__c"
        },
        Key__c: "$(prefix)|$(partner.partnerFunction)",
        Order__c: vars.order.id,
        OrderDeliveryGroupProxy__r: {
            Name: "$(prefix)|OrderDeliveryGroupProxy__c"
        },
        Role__c: partner.partnerFunction,
        SapBusinessPartner__c: (vars.sapBusinessPartners filter $.SapId__c == partner.businessPartnerId)[0].Id,
        Account__c: sapIdToAccountId(vars.bpRelationTable[partner.businessPartnerId] default partner.businessPartnerId, salesOrg, distChan),
        (if(partnerHasTemporaryAddress(vars.bpRelationTable, vars.accountIds, partner, salesOrg, distChan))
            SapTemporaryAddress__r: {
            Key__c: sapTemporaryAddressKey(vars.order.number, odgNumber, partner.partnerFunction)
        }
        else
            null)
    })
}

fun accConditions(conditions) =
    conditions reduce (item, acc={absoluteAdjustment: 0}) -> {
            conditionType: item.conditionType,
            percentageAdjustment: item.percentageAdjustment,
            absoluteAdjustment: acc.absoluteAdjustment + item.absoluteAdjustment
    }

var usedConditions = vars.promotions.ConditionType__c
var conditionGrouping = (flatten(vars.cdmOrder..*conditions) groupBy $.conditionType)
var taxConditions = conditionGrouping."MWST" groupBy $.percentageAdjustment
var adjustmentConditions = conditionGrouping filterObject (usedConditions contains $$ as String)
var accTaxSummary = taxConditions pluck accConditions($)
var accAdjustmentSummary = adjustmentConditions pluck accConditions($)
var mappedTaxSummary = accTaxSummary map {
    taxRate: $.percentageAdjustment,
    taxAmount: $.absoluteAdjustment
}
var mappedAdjustmentSummary = accAdjustmentSummary map (condition) -> {
    displayName: (vars.promotions filter ($.ConditionType__c == condition.conditionType))[0].DisplayName,
    adjustment: condition.absoluteAdjustment
}

var orderDeliveryGroupStage = [
    {
        method: "PATCH",
        url : "$(p("sf.apiBasePath"))/composite/sobjects",
        referenceId : "orderDeliveryGroup",
        body:{
            allOrNone : true,
            records : [
                {
                    "attributes": {
                        "type": "OrderDeliveryGroup"
                    },
                    id: odg.Id,
                    IntegrationStatus__c: "SUCCESS",
                    OrderDeliveryGroupProxy__r: {
                        Name: "$(vars.order.number)|$(odgNumber)|OrderDeliveryGroupProxy__c"
                    },
                    TaxSummary__c: write(mappedTaxSummary default [], "application/json",  {indent: false}),
                    AdjustmentSummary__c: write(mappedAdjustmentSummary default [], "application/json", {indent: false})
                }
            ]
        }
    }
]

---
{
    allOrNone : true,
    collateSubrequests: false,
    compositeRequest :
        compositeRequestStage("PATCH", "OrderItem", "Key__c", "orderItems", orderItems)
        ++
        compositeRequestStage("PATCH", "OrderItem", "Key__c", "orderHeaderAdjustmentLineItems", orderHeaderAdjustmentLineItems default [])
        ++
        compositeRequestStageDelete("DeleteOrderHeaderAdjustmentLineItem", outdatedOrderHeaderAdjustmentLineItemIds)
        ++
        compositeRequestStage("PATCH", "OrderItemAdjustmentLineItem", "Id", "orderPromotionAdjustmentLineItems", orderItemAdjustmentLineItems default [])
        ++
        compositeRequestStageDelete("DeleteOrderItemAdjustmentLineItem", outdatedOrderItemAdjustmentLineItemIds)
        ++
        compositeRequestStage("PATCH", "OrderItemTaxLineItem", "Id", "orderItemTaxLineItems", orderItemTaxLineItems default [])
        ++
        compositeRequestStageDelete("DeleteOrderItemTaxLineItem", outdatedOrderItemTaxLineItemIds)
        ++
        compositeRequestStage("PATCH", "OrderDeliveryGroupProxy__c", "Name", "odgProxies", odgProxies)
        ++
        orderDeliveryGroupStage
        ++
        compositeRequestStage("PATCH", "SapTemporaryAddress__c", "Key__c", "temporaryAddresses", temporaryAddresses)
        ++
        compositeRequestStage("PATCH", "OrderRole__c", "Key__c", "orderRoles", orderRoles)
}`

describe('full production script', () => {
  it('parses without error', () => {
    let error: string | null = null
    try {
      parse(FULL_PRODUCTION_SCRIPT)
    } catch (e) {
      if (e instanceof ParseError) {
        error = `ParseError at line ${(e as any).line}, col ${(e as any).col}: ${e.message}`
      } else {
        error = String(e)
      }
    }
    expect(error, `Parse failed: ${error}`).toBeNull()
  })

  it('formats without throwing', () => {
    const result = formatDataWeave(FULL_PRODUCTION_SCRIPT)
    // If it returns original, formatter bailed out
    expect(result).not.toBe(FULL_PRODUCTION_SCRIPT)
  })

  it('preserves descendant selector ..*', () => {
    const result = formatDataWeave(FULL_PRODUCTION_SCRIPT)
    expect(result).toContain('..*conditions')
  })

  it('formats conditional spread without extra spaces around dots', () => {
    const result = formatDataWeave(FULL_PRODUCTION_SCRIPT)
    // Should be Product2Id: getProduct2Id(...) not Product2Id : getProduct2Id ( ... )
    expect(result).toContain('Product2Id: getProduct2Id(deliveryGroup.salesOrganization')
  })

  it('places commented-out entries on their own lines before next entry', () => {
    const result = formatDataWeave(FULL_PRODUCTION_SCRIPT)
    // Comments should be before UnitPrice, not mixed into its value
    const lines = result.split('\n')
    const unitPriceLine = lines.findIndex(l => l.trim().startsWith('UnitPrice:'))
    expect(unitPriceLine).toBeGreaterThan(0)
    // The line before UnitPrice should be a comment
    const prevLine = lines[unitPriceLine - 1].trim()
    expect(prevLine).toMatch(/^\/\//)
  })

  it('preserves blank lines inside do-block var declarations', () => {
    const result = formatDataWeave(FULL_PRODUCTION_SCRIPT)
    const lines = result.split('\n')
    // Blank line between updateItemStatus and sfRejectionReasons
    const updateLine = lines.findIndex(l => l.includes('var updateItemStatus'))
    const sfRejLine = lines.findIndex(l => l.includes('var sfRejectionReasons'))
    expect(sfRejLine).toBeGreaterThan(updateLine)
    // There should be at least one blank line between them
    const between1 = lines.slice(updateLine + 1, sfRejLine)
    expect(between1.some(l => l.trim() === ''), 'blank line between updateItemStatus and sfRejectionReasons').toBe(true)

    // Blank line between reasonCodeIsSfRelevant and orderItemStatus
    const reasonLine = lines.findIndex(l => l.includes('var reasonCodeIsSfRelevant'))
    const statusLine = lines.findIndex(l => l.includes('var orderItemStatus'))
    const between2 = lines.slice(reasonLine + 1, statusLine)
    expect(between2.some(l => l.trim() === ''), 'blank line between reasonCodeIsSfRelevant and orderItemStatus').toBe(true)
  })

  it('preserves blank lines between header declarations', () => {
    const result = formatDataWeave(FULL_PRODUCTION_SCRIPT)
    const lines = result.split('\n')
    // Find the line with nullChar var and the next fun declaration
    const nullCharLine = lines.findIndex(l => l.includes('var nullChar'))
    const nullBooleanLine = lines.findIndex(l => l.includes('fun nullBoolean'))
    // There should be a blank line between them
    expect(nullBooleanLine - nullCharLine).toBeGreaterThan(1)

    // Also check: blank line between fun definitions and var definitions
    const mapRegionLine = lines.findIndex(l => l.includes('fun mapRegion'))
    const mapLanguageLine = lines.findIndex(l => l.includes('fun mapLanguage'))
    expect(mapLanguageLine - mapRegionLine).toBeGreaterThan(2) // multi-line fun + blank line
  })

  it('formats conditional spread key:value correctly', () => {
    const result = formatDataWeave(FULL_PRODUCTION_SCRIPT)
    // SapTemporaryAddress__r: { Key__c: ... } — no space before colon
    expect(result).toContain('SapTemporaryAddress__r: {')
    expect(result).toContain('Key__c: sapTemporaryAddressKey(')
  })
})
