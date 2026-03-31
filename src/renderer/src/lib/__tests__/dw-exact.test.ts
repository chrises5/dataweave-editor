import { describe, it, expect } from 'vitest'
import { formatDataWeave } from '../dataweave-formatter-v2'
import { parse, ParseError } from '../dw-parser'

// The user's actual production script (simplified but structurally identical)
const SCRIPT = `%dw 2.0
output application/json

import * from dw::core::Strings
import * from dw::Runtime
import * from dwl::common

var languagePriority = (vars.agLanguages default []) ++ defaultISOLanguagePriority filter $ != null
var nullChar = "\\u{2400}"

fun nullBoolean(b: Boolean | Null) = do {
if(b != null and b) (true) else (false)
}

fun compositeRequestStage(method, sObject, externalId, referenceId, records: Array) = do {
var r = records filter $ != null
---
if(r != null and !isEmpty(r)) ([{
method: method,
url: "$(p("sf.apiBasePath"))/composite/sobjects/$(sObject)/$(externalId)",
referenceId: referenceId,
body: {allOrNone: true, records: r}
}]) else ([])
}

fun compositeRequestStageDelete(referenceId, recordIds: Array<String>) = do {
if (not isEmpty(recordIds)) ([{
method: "DELETE",
url: "$(p("sf.apiBasePath"))/composite/sobjects?ids=$(recordIds joinBy ",")",
referenceId: referenceId
}]) else ([])
}

fun getAccountBySapId(accs, id, salesOrg, distChan) = (accs filter $.SAP_ID__c == id and $.salesOrg == salesOrg and $.distChan == distChan)[0]

fun sapIdToAccountId(sapId, salesOrg, distChan) = (vars.accountIds filter ((account) ->
account.salesOrg == salesOrg and account.distChan == distChan and account.SAP_ID__c == sapId
))[0].Id

var existingKeys = vars.orderItems map $.Key__c
var deliveryGroup = vars.cdmOrder.deliveryGroups[0]
var odg = getOrderDeliveryGroup(vars.orderDeliveryGroups, "1", "2", "3", "4")
var odgNumber = odg.OrderDeliveryGroupNumber
var agSapId = (deliveryGroup.partners filter ($.partnerFunction == 'AG'))[0].businessPartnerId
var agAcc = getAccountBySapId(vars.accountIds, agSapId, "1000", "10")

fun getProduct2Id(salesOrg, distChan, materialId) = (vars.product2 filter $.SalesOrganization__c == salesOrg and $.DistributionChannel__c == distChan and $.MaterialCode__c == materialId)[0].Id

var orderItems = deliveryGroup.items map do {
var key = "$(vars.order.number)|$(odgNumber)|test"
var sfItem = (vars.orderItems filter $.Key__c == key)[0]
var quantity = $.confdDelivQtyInOrderQtyUnit default $.requestedQuantity.amount
---
{
attributes: {"type": "OrderItem"},
Key__c: key,
Quantity: if (quantity <= 0) 1 else quantity,
PricingDate__c: $.pricingDate as Date default null,
"Type": "Order Product",
(if(existingKeys contains key) null else Product2Id: getProduct2Id("1000", "10", $.material)),
(if(existingKeys contains key) null else ListPrice: $.netPriceAmount default 0),
IntegrationStatus__c: "SUCCESS",
(TechnicalRejectionReason__c: $.rejectionInfo.reasonCode) if(true),
(OrderStatus__c: "CREATED") if(true)
}
}

var orderHeaderAdjustmentLineItems = (deliveryGroup.conditions map ((cnd, idx) -> do {
var sfPromotion = (vars.promotions filter (($.Country__c == agAcc.BillingAddress.countryCode) and ($.SalesOrganization__c == "1000") and ($.IsHeaderCondition__c as Boolean == true) and ($.ConditionType__c == cnd.conditionType)))[0]
var key = try(() -> "$(vars.order.number)|$(odgNumber)|$(sfPromotion.DisplayName)") orElse null
var sfItem = (vars.orderItems filter $.Key__c == key)[0]
---
{
attributes: {"type": "OrderItem"},
(Id: sfItem.Id) if (sfItem != null),
Key__c: key,
OrderId: vars.order.id,
"Type": "Delivery Charge",
ChargeConditionType__c: sfPromotion.ConditionType__c
}
})) filter ($.Key__c != null)

var usedOrderHeaderAdjustmentLineItemIds = (orderHeaderAdjustmentLineItems.Id default []) filter ($ != null)

var orderItemAdjustmentLineItems = flatten(
deliveryGroup.items map ((itm, idx) -> do {
var key = "$(vars.order.number)|test"
var sfItem = (vars.orderItems filter $.Key__c == key)[0]
---
(itm.conditions map ((cnd, iidx) -> do {
var sfPromotions = (vars.promotions filter (($.Country__c == "DE") and ($.SalesOrganization__c == "1000")))
var sfOiAli = (vars.orderItemAdjustmentLineItems filter (($.OrderItemId == sfItem.Id) and ($.Counter__c as Number == cnd.counter as Number) and ($.AdjustmentCause.ConditionType__c == cnd.conditionType)))[0]
var sfPromotion = ((sfPromotions filter ($.Id == sfOiAli.AdjustmentCauseId)) ++ sfPromotions)[0]
---
{
attributes: {"type": "OrderItemAdjustmentLineItem"},
(Id: sfOiAli.Id) if (sfOiAli != null),
AdjustmentCauseId: sfPromotion.Id
}
})) filter (($.AdjustmentCauseId != null) and ($.AdjustmentType != null))
})
)

var odgProxies = vars.cdmOrder.deliveryGroups map {
attributes: {"type": "OrderDeliveryGroupProxy__c"},
Name: "$(vars.order.number)|$(odgNumber)|OrderDeliveryGroupProxy__c",
CurrencyIsoCode: vars.cdmOrder.transactionCurrency
}

var temporaryAddresses = deliveryGroup.partners filter ((partner) -> true) map ((partner) ->
do{
var key = "test"
var addressMask = partner.addressMask
---
{
attributes: {"type": "SapTemporaryAddress__c"},
Key__c: key,
Street__c: addressMask.street,
City__c: addressMask.city
}
})

var orderRoles =
do
{
var prefix = "$(vars.order.number)|$(odgNumber)"
---
deliveryGroup.partners map ((partner) ->
{
attributes: {"type": "OrderRole__c"},
Key__c: "$(prefix)|$(partner.partnerFunction)",
Order__c: vars.order.id,
(if(true)
SapTemporaryAddress__r: {
Key__c: "test"
}
else
null)
})
}

fun accConditions(conditions) =
conditions reduce (item, acc={absoluteAdjustment: 0}) -> {
conditionType: item.conditionType,
absoluteAdjustment: acc.absoluteAdjustment + item.absoluteAdjustment
}

var usedConditions = vars.promotions.ConditionType__c
var conditionGrouping = (flatten(vars.cdmOrder..*conditions) groupBy $.conditionType)
var taxConditions = conditionGrouping."MWST" groupBy $.percentageAdjustment
var adjustmentConditions = conditionGrouping filterObject (usedConditions contains $$ as String)
var accTaxSummary = taxConditions pluck accConditions($)
var mappedTaxSummary = accTaxSummary map {
taxRate: $.percentageAdjustment,
taxAmount: $.absoluteAdjustment
}

var orderDeliveryGroupStage = [{
method: "PATCH",
url: "$(p("sf.apiBasePath"))/composite/sobjects",
referenceId: "orderDeliveryGroup",
body: {
allOrNone: true,
records: [{
"attributes": {"type": "OrderDeliveryGroup"},
id: odg.Id,
IntegrationStatus__c: "SUCCESS",
TaxSummary__c: write(mappedTaxSummary default [], "application/json", {indent: false})
}]
}
}]

---
{
allOrNone: true,
collateSubrequests: false,
compositeRequest:
compositeRequestStage("PATCH", "OrderItem", "Key__c", "orderItems", orderItems)
++
compositeRequestStage("PATCH", "OrderItem", "Key__c", "orderHeaderAdjustmentLineItems", orderHeaderAdjustmentLineItems default [])
++
compositeRequestStageDelete("DeleteOrderHeaderAdjustmentLineItem", [])
++
compositeRequestStage("PATCH", "OrderDeliveryGroupProxy__c", "Name", "odgProxies", odgProxies)
++
orderDeliveryGroupStage
++
compositeRequestStage("PATCH", "SapTemporaryAddress__c", "Key__c", "temporaryAddresses", temporaryAddresses)
++
compositeRequestStage("PATCH", "OrderRole__c", "Key__c", "orderRoles", orderRoles)
}`

describe('production script', () => {
  it('parses without error', () => {
    let error: string | null = null
    try { parse(SCRIPT) }
    catch (e: any) {
      error = e instanceof ParseError ? `L${e.line}:${e.col}: ${e.message}` : String(e)
    }
    expect(error, `Parse failed: ${error}`).toBeNull()
  })

  it('formats and changes output', () => {
    const result = formatDataWeave(SCRIPT)
    expect(result).not.toBe(SCRIPT)
  })

  it('format is idempotent', () => {
    const first = formatDataWeave(SCRIPT)
    const second = formatDataWeave(first)
    expect(second).toBe(first)
  })
})
