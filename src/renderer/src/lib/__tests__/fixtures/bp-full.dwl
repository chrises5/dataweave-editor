%dw 2.0
/**
* Change History:
* |---------------------------------------------------------------------------------------|
* |    Date    | Developer | Description/Reason                             | Requirement |
* |------------|-----------|------------------------------------------------|-------------|
* | 2025-06-03 | AB        | Add WAES to request for Bill-To/Ship-To        | SM-1333     |
**/
output application/xml indent=false

import * from dw::core::Dates
import * from dw::core::Strings
import * from dw::core::Arrays



import * from dw::core::Binaries
import * from dw::Crypto
import * from dw::Runtime

fun getSha512Of(inVal: Any): String = (
    toBase64(hashWith(write(inVal, "application/json") as Binary, "SHA-512"))
)

fun getIndexMap(inArr: Array | Null, filterCriteria: (item: Object, index: Number) -> Boolean): Object = (
    if (inArr is Null) (
        {}
    ) else (
        (
            filter(flatten(inArr), filterCriteria)
            reduce (item, acc={}) -> acc ++ (getSha512Of(item)): item
        )
        mapObject (dat, key, idx) -> (key): {counter:leftPad((idx +1) as String, 3, "0"), data:dat}
    )
)

fun getCounterFor(inVal: Any, indexMap: Object): String|Null = (
    try(() -> (indexMap[(getSha512Of(inVal))].counter! as String)) orElse null
)

fun isGuid32(inStr: String): Boolean = (
    inStr matches /[A-Fa-f0-9]{32}/
)

fun isGuid36(inStr: String): Boolean = (
    inStr matches /[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}/
)

fun identifyGuidType(inVal: Any): Number = (
    if (inVal is String) (
        if (isGuid32(inVal as String)) (
            32
        ) else if (isGuid36(inVal as String)) (
            36
        ) else (
            0
        )
    ) else (
        -1
    )
)

fun guid36ToGuid32(inGuid: String): String = (
    if (isGuid36(inGuid)) (
        upper(inGuid replace /-/ with (""))
    ) else (
        fail("Invalid GUID(36) provided.")
    )
)

fun guid32ToGuid36(inGuid: String): String = (
    if (isGuid32(inGuid)) (
        lower(
            substring(inGuid, 0, 8) ++ "-" ++
            substring(inGuid, 8, 12) ++ "-" ++
            substring(inGuid, 12, 16) ++ "-" ++
            substring(inGuid, 16, 20) ++ "-" ++
            substring(inGuid, 20, 32)
        )
    ) else (
        fail("Invalid GUID(32) provided.")
    )
)

fun toNormalizedGuid(inVal: Any): String = (
    identifyGuidType(inVal) match {
        case 32 -> lower(guid32ToGuid36(inVal as String))
        case 36 -> lower(inVal as String)
        else -> lower(uuid())
    }
)

fun nulChar() = "\u2400"
fun htChar() = "\u2409"
fun ffChar() = "\u240c"
fun spChar() = "\u2420"

fun nulRegex(): Regex = "\\s*$(nulChar())\\s*" as Regex
fun htRegex(): Regex = "\\s*$(htChar())\\s*" as Regex
fun ffRegex(): Regex = "\\s*$(ffChar())\\s*" as Regex
fun spRegex(): Regex = "\\s*$(spChar())\\s*" as Regex

fun phoneCleaningForUri(numPart: String, keepDashes: Boolean = false) = do {
    var dasherized = numPart replace /[\s.\/\(\)\-]+/ with "-"
    ---
    if (keepDashes) (
        dasherized replace /[^0-9+\-]/ with ""
    ) else (
        dasherized replace /[^0-9+]/ with ""
    )
}

fun toNormalizedSapId(sapIdText: String | Null, maxDigits: Number = 10): String | Null = do {
    var regEx = "[0-9]{0,$(maxDigits as String {format: "0"})}" as Regex
    ---
    if (sapIdText is Null) (
        null
    ) else if (sapIdText matches regEx) (
        leftPad(sapIdText, maxDigits, "0")
    ) else (
        sapIdText
    )
}

fun toShortSapId(sapIdText: String | Null): String | Null = do {
    var regEx = "[0-9]*" as Regex
    ---
    if (sapIdText is Null) (
        null
    ) else (
        sapIdText replace /^0+/ with ""
    )
}

fun cleanupSapId(sapIdText: String | Null, maxDigits: Number = 10): String | Null = do {
    toNormalizedSapId(toShortSapId(sapIdText), maxDigits)
}

fun toBoolean(inVal: Any, defaultReturn: Boolean = false): Boolean = (
    if (inVal is Null) (
        defaultReturn
    ) else (
        try(() -> inVal as Boolean) orElse defaultReturn
    )
)

fun toString(inVal: Any, defaultReturn: String = ""): String = (
    if (inVal is Null) (
        defaultReturn
    ) else (
        try(() -> inVal as String) orElse defaultReturn
    )
)

fun toDateTime(inVal: Any, defaultReturn: DateTime = now()): DateTime = do {
    if (inVal is Date) (
        (inVal ++ |12:00:00Z|) as DateTime
    ) else if (inVal is DateTime) (
        inVal
    ) else if (inVal is LocalDateTime) (
        inVal as DateTime
    ) else if (inVal is Number) (
        inVal as DateTime {unit: "milliseconds"}
    ) else if (inVal is String) (
        try (() -> inVal as DateTime {format: ""})
        orElseTry (() -> inVal as DateTime {format: "uuuu-MM-dd'T'HH:mm:ss[.SSS]X"})
        orElseTry (() -> (inVal as Date {format: "uuuu-MM-dd"}) ++ |12:00:00Z|)
        orElseTry (() -> ((inVal as Number) as DateTime {unit: "milliseconds"}))
        orElseTry (() -> (((inVal replace /[^0-9]/ with "") as Number) as DateTime {unit: "milliseconds"}))
        orElse defaultReturn
    ) else (
        defaultReturn
    )
}

fun toNum3(val: Number=0) = leftPad(val as String {format: "0"}, 3, "0")

var clientId = Mule
var bp = payload
var bpRoles = bp.roles
var bpNumber = if (not isBlank(bp.ref)) (cleanupSapId(bp.ref)) else ("")
var isPers = (bp."type" == "1")
var isOrg = (bp."type" == "2")
var isGroup = (bp."type" == "3")
var currentDate = today() as String {format: "yyyyMMdd"}
var unlimitDate = "99991231"
var isCreate = isBlank(bpNumber)

var objectType = if (isEmpty(bpRoles.code) or (bpRoles.code contains "FLCU00") or (bpRoles.code contains "FLCU01")) (
    "CUSTOMER_SO"
) else if (bpRoles.code contains "ZFLCBT") (
    "CUSTOMER_BLT"
) else if (bpRoles.code contains "ZFLCSH") (
    "CUSTOMER_SHPT"
) else (
    ""
)

var subType = bp."type" match {
    case "1" -> objectType match {
         case "CUSTOMER_SO" -> "BP02_PERSON"
         case "CUSTOMER_BLT" -> "BP06_PERSON"
         else -> ""
    }
    case "2" -> objectType match {
        case "CUSTOMER_SO" -> "BP02_ORG"
        else -> ""
    }
    case "3" -> objectType match {
        case "CUSTOMER_SO" -> "BPAB_ORG"
        else -> ""
    }
}

var KNVP = flatten(mainSArrs map ((sa) -> sa.partnerFunctions map ((pf) -> {
  VKORG: sa.salesOrganisation,
  PARVW: pf.partyRole
}))) map ((knvp, i) -> {
  row: { MANDT: clientId, UNIQUE_NO: i + 1 } ++ knvp
}) reduce ((item, acc={}) -> acc ++ item) default {}

var KNVPwithPARZA = (((flatten(((KNVP.*row groupBy ([$.VKORG, $.PARVW] joinBy "|")) mapObject ((value, key, index) -> {
  (key): value map ((item, iindex) -> item ++ { PARZA: leftPad(iindex as String, 3, '0') })
})) pluck ((value, key, index) -> value)) default []) orderBy ($.UNIQUE_NO as Number)) reduce ((item, acc={}) -> acc ++ {
  row: item
})) default {}
---
{
  "_-MDS_-BP": {
    "import": {
      "IV_REQUEST": {
        "MANDT": clientId,
        "TYPE": bp."type"
      },
      IV_CONTROL: {
        ACTIVATE_TRACE: null,
        EXTEND_CREATE_REQUEST: "X"
      }
    },
    "tables": {
      ("IT_BP_ADDRESS": {
        (items map (item, idx) -> do {
          var isDefault = (item.usages is Null or ((item.usages is Array) and isEmpty(item.usages)))
          ---
          {
            "row": {
              "MANDT": clientId,
              ("ADDRNUMBER": "MDS001") if (isCreate),
              "REGIOGROUP": if (not isBlank(item.code)) (
                  leftPad(item.code, 8, "0")
                )
                else (
                  item.code
                ),
              "UPDATEFLAG": if (isCreate) "I" else "U"
            }
          }
        })
      }) if (not isEmpty(items)),
      (IT_MDS_REQUEST_KNVP_T: KNVPwithPARZA) if (not isEmpty(KNVPwithPARZA)),
      "IT_BP_IDENT_NO": {
        "row": {
          "MANDT": clientId,
          "IDENTIFICATIONTYPE": "ZSF_CU"
        }
      },
      "IT_OVERWRITE_TABLE": {
        ("row": {
          "OBJECTTYPE": objectType,
          "STRUCTURE_LONG": "BP_ADDRESS",
          "OVERWRITE": "X"
        }) if (not isEmpty(items)),
        ("row": {
          "OBJECTTYPE": objectType,
          "STRUCTURE": "KNVP",
          "OVERWRITE": "X"
        }) if (not isEmpty(KNVP))
      },
      "IT_OVERWRITE_FIELD": {
        "row": {
          "OBJECTTYPE": objectType,
          "STRUCTURE_LONG": "BP_CENTRAL",
          "FIELD": "AUTHORIZATIONGROUP",
          "OVERWRITE": "X"
        },
        ("row": {
          "OBJECTTYPE": objectType,
          "STRUCTURE_LONG": "BP_CENTRAL",
          "FIELD": "NAME1",
          "OVERWRITE": "X"
        }) if (isOrg),
        ("row": {
          "OBJECTTYPE": objectType,
          "STRUCTURE": "KNA1",
          "FIELD": "NAME1",
          "OVERWRITE": "X"
        }) if (isCreate),
        "row": {
          "OBJECTTYPE": objectType,
          "STRUCTURE_LONG": "BP_ADDRESS",
          "FIELD": "C_O_NAME",
          "OVERWRITE": "X"
        },
        "row": {
          "OBJECTTYPE": objectType,
          "STRUCTURE_LONG": "BP_ADDRESS",
          "FIELD": "CITY",
          "OVERWRITE": "X"
        }
      }
    }
  }
}
