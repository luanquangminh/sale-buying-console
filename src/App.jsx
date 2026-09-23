import React, { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { api } from "./api";
import { useSyncStore } from "./syncStore";
import { extractPdfForImport, imageToDataUrl } from "./pdfExtract";
import { fmtDate, parseDmy, todayIso } from "./dates";
import { pfiTrackingStatus, rollupStatusLabel, TRACKING_TONE } from "./status";
import { applyReceipts, matchPfiLine, stripDerived } from "./receipts";
import { mergeOtherRole } from "./merge";
import { addMonths, inMonth, monthGrid, monthLabel, startOfMonth, todayLocalIso } from "./calendar";
import {
  Building2, Send, FileText, LogOut, ChevronRight, Plus,
  Users, Package, ShieldCheck, Inbox, Truck, Upload, Download,
  Paperclip, RotateCcw, CreditCard, Bell, Factory, AlertTriangle, Trash2, X, Ship, Search, Save, Pencil, KeyRound,
  ClipboardList, Briefcase, CalendarDays, Warehouse, ChevronLeft, Bot,
} from "lucide-react";

const COMPANY_NAME = "FMCG TRADING LTD";
const LOGO_SRC = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAG4AAAA2CAIAAACp5Ds2AAAdOklEQVR42u17d3wVVfb4OXdmXsl7L+WlF0gjhUBCgBCIUqQpCgJKFWQXKQKCDVnd1UVBVFbFVVhRQARXVHSluAoivddQAym0NEhI78l7b2buPd8/HrBAQtT97ef3F+eTTz7zmTf33DPnnn7OoBAC7sH/Atg9Ftxj5T1W3mPlPbjHynusvMfKe6y8B/9fWIk3wH196807fr3jfot3Wvl/c8nNhc0wuK/vXNIKtpvU3UHnHTs2u27tgf+elZqmOxyqqukAoOu6G6+uc10XiOh0ai6X7nKp7od1nXMu3KuICBGdDhUAiEjnHAA0TSMiXedExDknAF3TEVEIcLm0W0l3OlX3CwhB7p84F0IIIUjXOSKqqiY4IaKu6SRI13QA0FQdgIQQmqYDgKrqTU0uTeOcC6dTdZ+HGz/Xhabp7i1UVReC3NdOpwqAAKCqmntfRNQ5d2/aCqOkN954o3V5HDdh4dKlP9g8FZcGo0a+/cgjqfV1jU9PW7J+3Z7OKTEL3vznq699nXspf9DD3RHFi8+vPpx+ISDANnTIwqFDUjZtPvbyiysv51+NiPR7c8HXwUG+Sz761m73Xbbip5i4oKenLfHz91yxYkNaWuIzs5Ys/XRrRNvgiAg/AFqyeMNf3/hCdYmY6LCZz326bNlP8QnhOdm5i97f6HA27d57yu7vM2ny+1t/yXjggcSXX1lqMnt8+MH6Ht0Thg+bHxjic2B/xrt/+2Hw0NQnxrz3+cqfgwKt27affuH55RcuXrnvvlijwVhUWj5jxierVm3p2jU673LJ1KmL9h480793l+/X75s9Z9mVwuqUbhFjR//ts1Wbvb3Mfr7eU2Z8uParPak9Yu0+nv+dVJIQUFuhv/v+1OFDe5/LKMg4U3K1uPJ01nlFtgx6qHNDXeMzzz1mtonps0a6D6boavWBfeePH8vNOHNVddHmH09OnDzoWHoWV6Xioqpz5woEoarp167Vcc727Lhw+OCFiorGvEvluqZPefqBM2cyAdDh0Hbtypgy9dH0o6fOZeVX1zT0699985ZTTp02/ngq42xhXa3j4J6MtuFRPe6Pqq1puHq1vK6+qfBKJef88uXKAwcuHThwOT+/mrsECli2fE7/Ad0uXS4cM7rXubN5F/PKAfHIkXMms/L4qNTcvKKde049Orx3XW3tuXP5//5p55QZwzMzCirKnC5VHz36wfUbD5w8eVF18WEjUuprGv57BUcEDnzjukO1tY7i4pKefSMu5hSkpSaVVxaZbNbk5Bi7t4eHyRzgbwYQALrdX25qbDx44ERwiFWAkAx1/oEW2WCw282eVvPxE+fbxYYpCsqSEQDsftYTxy8rikGQ8DAYJa4ndWkHQCAQ0JXaJfbvi59lBjKayNfboJDLKElGg37iRK6E7KGBKTnnsjvEx0REBgESIsgSEongoMCMjMKKygZ7gI1LUFnjWLF8o8PpNBg89h7MAZTtNisACF0CEN6e3jGx4RwMQUF+HgZPFTUAU1CAzWI2CMEVBdoG2TVwpvSIJ5cwSt6dkmOI6L+3lQJ1f19fSTJkZV2rr2c554tsVvOi96evXr31VEaexJhECgk3HslklgODfU4ez4+J8hZcI2JMAiQymkwBgX6HjuS0j4/ighMJrlPHpLYl5Q31dYIAFCOeTC9Y//0hAEQGjGFjU9PRw5lCICJjkgQcOYfOXWIvXqh0aRQQ7D1vwVPvvb0hL6+SMYMiGQA0XfCgQGtVWbXqcgX4WblGVquxT5/OHh4Kk+DK1arQEK/wiEAAACKDQdq5I/PQnssmxcSYhEjAZSFIkiQACQmBEchAJGxmwweLZnz19Y4j6edbMZetsxKJAEmMGdfdapPKyiqjI4LyCop27T629usdUW1Cc7LzJIm5XO4yHQGAqvLwtr5BwXaLzSwEl9B2/Giuw+GUZCmsTXDG6dLwiCBN45ru1HXdajUkd4qsrqk1mTyKixuNFpuPzfO6ZxDGn7ac+PSTTUYmVVfXnc3ON3oYXC41PNwvItzPpek//Hhg965Ms6fhSkGJxeh5/ORlQhCcKUYtJMQa3saXdI0J4KoLUVRVNupNTWNH9KiprymtqAUAs9VQXemSDWg0C0luTD+WWV5dZTUaDAZ+9FhObUOjQZbq67SDB89ZFEt6es7y1T/4B3tnncn7b9wOIQAIhlhZUXNf9w5MoUaHc87Lo6sqKx8Z3Gv/scseFmnS5IeNslx6raxnr04GgyyASsvLuyRHJnQI8/e3pKUlxrYP273j9MjRfTolRXGuK7J4bESK6iLO9aSkyMbGpoEDO0uSGDqse2lp5bXishdeeNzmaZYV8vDw2L//7KTJQ3p0b19UVF1eVj5jxjBEbrEqqalRfv623g90/WVzelys7/hxfUPD/HbuPDzxqcFJiRE1NTW9endI6NjGw2Lo2j0uO/vKgYMZoW38fOyW+NhwD6tHmzZ+vnbPoBD7xZwil7Np4qSBURFh239JT+6SMGrE/SGhYVu3H314eFqPtJis7LK6mtrnZg6P7xh+4ECOwpSnJg+wWs13lbu7lX4JQRD9+/tdRfklikY6I2aUOCjMaHBqDkVmglOjqynE23fSlKHA0G1Ebsq/rmqfrdpSX+9SDIqu8ohIv1Ej+9yNiGPHs/fuyZRkWVN1SaLxE3oGBwTfJMQdmjQHnYsDh04fPJCfd7nC0aQxULx82H09Y3vdH9+mbYA7AmtRH1u8X+ty7dx16uzJC2puuXDVaIJsISExneN63J8QFRF869rfzUok0BlOGjHXenhveF2Zw9VgBDT4B3qkJNmSOpoj2yp+AarQv/tq26rVr9k8bbfugUh19U0x7V8oK2oEUADAaNZ//PHPDw5IuoMURLxypXLgQ2+ezy4FkAHQaNROnHy7Q0L0XYhGRI1zWvevY5u27PP0sq9ele5oIgACkAAQQAQGyOPHpb44e1BYm9BW3vwmuiZV+3rN9kOfbLBdPBFFDfaGSjPo9TZ7ZVhEdUx8qTXaK8T7uRlDIqLsAgDJcDdU8l3jIAAgVfE09Zg5paOny1ia67xwgWef145s1I9tlIJCPOPiDB06bZZAkNScQi5EQlxg/17BpzMKC69UNNbDzOmf7d4zPyzMJkgC4EAKY9zpcr00+4vz2U4G/gAgQBgNLtYSVUQEgIxBbYP21utrJGLz5j9l9zZv+C7L0aQzcBEqAIQglZaJv3+0e8uWjE9XTO3TO1YICZG1hBCRQWlZ7bxn3nf9tHGwXBzg5WFsE2BI6ObdPdW7Q7KlXXtDsL8A2P7z8b++unTy1FF9+ycSEBECCmzmZuS7nxfIKFfVsknztgW3DWgfHZzU/pGElBFRVt1aVSSdO8Nzzl7anaFGdQdZanYKKFRoF+W17LNZtXX1RXmlpzIKdm8/99a8Lz9aOs1oJBISgA4gL1788/frTgJ4I9D1SBYkjtSyyUHucML8WR+ajh9/6/AaZrOWllUI0AE0ATIQMQBAHZERWbLP1w0d9u6m9S/16pfYomgyBqVVdXOeWxxVWzx8zlj/uDhzUqI9OhJsJrrujvWK6upLF8sKr1ZdK5PHP/nBd9++3KtPRyK9RXcttxIFAQCAwnXj1dz6q7lV27driC67n7ltdEhSQvewvvdXXiiubGhiqAMYm2uOWu+oLyzxbBtg79QusVO7P0zoP/fNlctW/PLCs48BCkRp25bTb7y+DkABcHEwIDAAvJtlRAYIyqqP1zm/WTWms4/gGgPQOblcTkXhdl9F51plOQCRzcsWEW7tlNg2Kc53xd+/bxMeFBEd1FzTBcH7b63pPaDL1KdeBskEALWOhjXr96afytZVIUss92Lt2bOVJdfqNZ0AZAA2c/rKzb/MDQv3BIHNyZRbtSSckQ4gZJAFSB4WwxerXgoNs3Bd58C5AEDJx9vDw2i6lVAC5ACyIqtnzu7vc39gQpQx7T7frp294jo+/8zjf3p55b4DF3r3jL1wqejz1Zu/XTsn50LRsfT8zHNXrxZWNTkcJIzNdcctJpl51/b/Y+U0fo3pNkmCgsKyN+d/OWVK2oiRvYJCPLnGz5y6+tHizd2SQp/uG8zOZxSczdh1tGDrtvRpMx69XbWBMdi195QOOHXKkMY6Z8HV/KPpl3ZvO9KxQ+SkcQ/6+NkcDv3smSufLt9+5UoNMDMDRoBncwq++Hrr3FefoN9lKwEQQGbIAFQdEIAUyXhfr8jgYJ+WrNhtyxgQETcEBfgF91bPHi4/tjhfmGW7wRwVnWaM+ei1xWFrXl+44NunJg8e9FAyQJLToVfV1RVfrc04nf/56s26rjX3gYD089o9ycXnfYRTZVhdpf31tZWPj057bGhfAA4gAVC7dqF9+yf+Zeaifz+9DBuqTgQnjXv3heFj+9wpkowT0do1hzTueOqPC9NPXs3LE0EBuPbr51LT4gA0AAlAah8f+eAjyTNnLvtmTbYA9PJRpk57/I8TBxJobl/6W1mJgMTBZucrVk1s08YPmLxs+ZZtO89ER/sLDgAIhERksWByUox0u7lkgBrXlXbh3T97RTjqi7NzPp6/ZsofextMUoTBF7OKxo5bNHZs70EPJQOAQ4OF7337zKxhKV3jUrrGZefkaVxtnknUOUT2tl2PMycDUgzGr77Y1jWtvZuPRAyAOOpMMLvd+vKb06eey0ns0WnBq5NiIwObHTYhYOm12obGylFj+zGEIaMNyxdvmfHswNS0eCJC/I+P9rZ5Lvn4meysN0LDAhcsGJOcGA4AAKpgOpL8m6WSBAGaCTuLkli1jlAptVaeWLjstOIWEmAoHJoxzzfw+03vWBX5FnIJgElMUYrLrq3bqDCXS8jbLrk80uun9Q+RXHVDQ2xSO4++/o7SjV9x9Fx9pHzD9/tHRhrJQwZmbMjLlaB/83OtrKpTcwsDyUmIjaX1GelZb33+CgAQSe5wQyIGiEQUHRO08qdFbcJCFJkJouamlwPLu1Qa7Goc4FELmqukASMClIcf6koEAGLddzt3bzxmNUiAAKQzxFgPV7BZXb943bcuVzWJSc8O6dY98fcEQwjAmKlWzZw+W6caQay9LHVEAwEHxgAAQZQqfhs8ehK2EJkySXZeuHR2/Apv3lAs+8cnPpmfmb/y728/RNdQUFeZyr5WAZU9kv/FB6d1jbBnznw5urHEpRgbfROFMqs5wqqyMourzsxdginFhVUY5/L1NwJQ8ySYiKIiwgCIWuIjAMiAlbWV8tZfsn5aDIwf033aznzDZDBy0iRULp3JM323JsVYQ4IBaQiYKiv6UU4EyMR6Ci58rEf37kCAt+/eag6uAWgkTEhWRjYEk9CNvMnAycBVA1eNumZ2NQog3mJGgciQPEF4A3rpXDapsz+YcapDz3zFbJSMIHQrg2uK7Xhkzz9/ONXXIjy4ZicygFEBs9xSMKRxZBwEIhIDkEAyMVSuC9mdPkq/oRyCAKklbLoOyMgbyIakIKKVAQAjAACLTNGG+g5Q3hHK2mNlPFa00ys7Uk1HqmpPjmDZKKEAYHfw8VfiSgYgAWiCa8QZUKEUfBFNREISLgBAVOo1pcKpMKAWfRaQ0IWuCtKxUdYa2kUHzfrgpWWjCubUn/LUqMoc8J0xetL7L8VHBTpVxgVyANSauHDwlmTJx8euG6wOBYyCWZVGtbSqscnpaVGaeQBiqJ87lxsQYA8I8EVwEUkA0u2kkbevTyPKLtKZKnzQde5CkQNIRqGAcJIAMDaCmUBySgYFNEWgS6sHEsiwQQZvf7/fl+2Au8KkyJjUUTU2cVneXBroPWJUaICBCbdXlXxIG+HvZZCxxaIxWq0iJaWJmhxgRrOH7nL165t49qVZ33y4cEq85YccV6dnZj48uLPOOTdKelJiPTWSpECdN9N4c4R2X0tjYHBdhcVfVAdYLB4NVfv3nhv8SFcgBLw1Z4XS0sYXZ37sbfcZMiJ15PC+FqvxDg/OASPa+teHRNd5m4y8yd9gq8wrvZCV2ykhCgDAbNnh3/6cKVZisgChOiEEHcPaOCSuCzQ6qoJCw/xbrgyIuwBxzjU+bfrCi1m5pDmJq7OfW3I25xo1A87125dyIqoor5s+YYHe4OBNDaXFJZPGvVNXVy9Ir2usmzZ58dyXVk2f/G5NnYNIV13q01Pfzj+f56ypcTW5nn/m4/STmUR3kiOE9uL0RUtZ+Glgp7p0yz5wYuwTb1zOc9MjSAgiTkROh/b8C/9YvXpzbm7x3PkrJ457e/NP+wUXQvCbuHSiRqdj8h8XZZ/OJ0cTaY5tW49Nnvi3mtp6Iqqoqc3Nq7hUUFpYVFpcUjbrhRWrP/uFhEa648ql4j9MWNDkaOTEm3OsFbeDTMK6WvHklOU2qwcgKyqqnT4DATjRbTlJSxkuAZBDkcliAgCmSg5FBkIgyeZhnvPKiGdf+OiDD2d52RQCBMbU2uqsTeu0HqnWqPaNLgeiGz/dFqIjPDK631ffbkxtKJdIje8UM3X6qFf+snz8qEH9+7W3eZlUl3b+QtEnn2yMbBM0+vE+RTmZo9sq/9xWsGHdvkGP3M8QiPCGrwcPozzgwa4Tpy+Lamstr3KqpB0/Ul9c/unrbwxP6Rri6+UBQFUVdctW7P3umzOZCUXf/OswgrG0vHLipJ5mk0m05M9aTRyRXA756KFCd15oMduYzG9awtaBiCRgMoBDdzQV5KLDwRlD4EJAuxj7uu8WmC1GATqChECabDtU4b/hs8zjJzYWlVY8P3tkM8tLHKhPr8Qfhzy069vivsyo63X9enfw8jQO6v+Wn59nWBv/2tomL28x89lHhg/tAwAxqanFoWFFGy/NnT2BMSSCG2dDhDoCDBueuu6HvZ3jQ3xtlvTzpUJUnkzPHzjg7biYYD9/ExC7dL7icn4loGn3ngIAGUCPi/MZP7o/kEpgaJ45yq22fVRCAWBkaBCkSYzT9VoW/SorZVnRS0rOvPaGfmjnxcslos1AlIAjMJCImMWCggBBQgCGWFrKv/5mO4ARQLLaLNBi0Z9kRcYXF0z9c3q2HWu7KVYACg3zAdmYc8GZc6EIQLf7mN97Z/fmTTm9eraLaRf0xT93PDKyV/uksNttJQIhgWT2UF7965PzJ7w5RsqbGR9Cvds1je5R4LSeKqw/kVV09nxlVYkOIANpMnrqxL1s+uKPxvkH2ogEtmQrW/HgBCARGQFAkBNRmIwWEobfOqrAJFdubvHpE8FxEeFDhkKxEQRn148B6UY/2n0oAiQAqwQKBw7AWzwqBkBEkRFBf1q74L3ZSwN3ZD467D6DQkwYAIQECAjV1a7DR4sOH7228rNddl/pnXfGjZ+QJoQL0XQ7TsldzkhOavviJ3M+nvhmydr9vSzbXQY91NcWGR47oUOic2BsscE/r0Ecv1C6dXOuw9m49NOJDw1Kcdf6EH6fghMAY3JTt9SAfn2TUlPbrdt40N2V/y1AXIOwCDZuyv5qcejklcKqQonJCIJaIkLXOIDbbQtV1Vsp1wohUjpH/m31Kx8s+vKXHYd7dE9WVQIg7q7PgQBQgbn69I6dP++JPn0iODFEpcWzISAhRO/7Y4N+WbJ03przF3NSQliU1qjnX2o8ulbVmoR/oC28XUCb1Ace8Jn69MT+Azq3Xki+ew5OTADFxAUyiSqrS37aUtTkqjZ7ila1m26GQiBrkm/ogi8PN9Q5NE0kd/GXJGopdiWhQVKHwPpGhywzLoTFIkxGGUDcSB/uqLoDEURFBC75x5yDB89u+flwYrL3lcIGTVOZxLy9fBM7BT02NGXwo53NJg8SnKHb1dAtJh5viLkAphCx+OjgxWtePngga8f24ycKK8AzjgWUOAsLnEarb0jCfQ+nvjasl7eXJ5Fo3Um01pAQoGqCSNwcPiGFAQMDMWzuZBi77c055wBCktxNAtR1TUJElAX850kCnUjmukNRzAAIoBMQCQZCAAKTFHch4nof5rpq4fXmDAEwASABiMrqapdTADCLxeLlabiRitxsN92WNwghGKNbgnZ3p4cDMABUHWp5RZ0K3MCE1WL18rYBEAidUP714aq7fiFBHAARGDC6TplghETgNnl3Qn7e1ZOn8hTZyIVuthr69Ul2NDTtP5Dt1FxBgQGp3eNlWQeQEPDS5cKzZ/JTUhLahvsS6U4nP3ggq6HBYTKZO3eJDQy0CeJch/37TgcG+iZ0CC8rq8jKzO/br1tdfcP+fSc7dYoNDQ1EBIfG9+3LqCypT+oU0bFj+I0aDDHEY0ezGWNdU+IA4PLla2dO5yoGmWvkY7f26hNfXFR64kQe16WAQFtKt3izSSIQQJJb6xnCdZ0QKNxiiBx/y8if+HXQb/xdj8Dv/J0TEX3/3c/+ASOMxgkW2xP3957Z6HIcP3pBxjFBwX+w+z757ItLNe4UpBPR5KlLAIbMeekLd3RdU1/fpu00m+d4/4Cn2kY8vWXbcSLucqoJHZ+bP28dEW3fesRgGLFu/eErxWXe3uM3bNxPRJW1DSPHfGD1fDwodIrN68lPP910I6onIho8/K0JT37oziA+W7nJx/6YYpxgtY4ePPg1Im3jhr2Aj/oHTfTxGvPgg68XXa26JSPgQghBmiBVkCZ+D/yW+UqGKCFKN8bqGN4BDAD4oMGpR498Eh3l/ey0QRvWvWU2GHVCZLD5x7mLP5z85aqDxddqEHhZafX+PTkJ8Z227cioqa11qyEX9OY7fzh27J2B/Tv/6cUv6huaAJAxGVECAMaYquLsl748n1NmNnm4O/Sff7Z1z87TmzYvOJ/14efLZ3VNbge3tjyZxFBya++4J/odPrg40G595+2Ja758GUDiXLFZrRt+mLNr7zuFV8rff3fdLcONDBERZAQFQb7jRX8l/vt1EwCYmVVw6GDWjUpMMxSMD3yoa0io3RiKoMie3sYAf28AANQB2Uf/2FpSUtexY6SXlweAsmf36YZ6x7JPp0+a/u7x9LwBA5Ldimn3tkWEB02d/sCGDXtz80o7JEQgXDfJRGC1GXSd/vLntZp63dSeOp7Xt2/nPj0T/v7+v/ceyTTIpoVvPxEdHXT98G80ugDRw8McEuYHiu7j6+lj9wQAQiGDEuznFR0dNmJ0z33bMgAg60L+of05Nwq6eIcjFdDUr1/X6KjWusHyb5BKXlZecupMhsyMzV0YESjIU9MiQkJ9OCdAjd/YHkFGCa9cKzu4L3fd+ue8rB6CxA+bz9TUwedfbKypoi0/Zw4YkIyAgKgLoevqzh1ZNps5ONgudEACd/hGhAaF3low8s+vflVRpTMmAUBkVPB33x7Iv1rZuVv4iYy8td8cnPf6SMTrWQ0ScWKCSCMyMqGL60OXNwjjgI0aF1XVDfv2ZkdEhABARWX1yZNZMpNa9NKcHF1TIoH8W2xF/FZWElHfPt369une2jPgANABJIfD5Z4RBQAuhOoqf2fh6++9vX750k2DBiQXXqvesuXU/b3ig0Is3VMj/rV+92tzH1WMkqY55839csmiHwuulL373tgAP2/VoTc5GjVNBQCui5rahtS06L8tHDtp4lJVUwFgyrQHt2w9mZb2YlL7mMzM/CmTe8XEhAAQEAIiY7hx/fGsc3P69497792pQNTY5LxJGHCsrnONGb2ktsZhNIuPl0wk4L3Tknundf4VVgjeSjjU2qjqjfqfEORWGH4jRrvjD929TQT08fFI6xEXGuoHALKCoWH+D/RO7N07gYSWkNBWCD3I3zp37qixY/r079/Ry0dJaB/uabP4+Vo7dghP7hz+yqtDhw/tjkCA4O3j0aNHTGiYr2KQIyIDeqTG9ejRPiLKPyWlnd3u6eNtGjash93LIivw5B8feGn2CJNJphvpnKfN1L59WHx8WJfOEXHxYYiSn6/1vrQ4f39PADAYsW14UIeE8AcHJsyfNz4uNlgAAd3tBQWAIAACAgZ4d17i//Zz0Ztx363zQ61P7dw5wXPDGv0nhERsscd5x/3bJ23wbvu2vvD/6d3vfXl772OTe6y8x8p7cI+V91h5j5X3WHkP/gfwfwlmjHSafeuoAAAAAElFTkSuQmCC";

const ROLE_OPTIONS = [
  { value: "sale", label: "Sale" },
  { value: "buyer", label: "Buyer" },
  { value: "admin", label: "Admin" },
  { value: "warehouse", label: "Warehouse" },
];
const BOOKING_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "loaded", label: "Loaded" },
  { value: "in_transit", label: "In Transit" },
  { value: "arrived", label: "Arrived" },
];
const BOOKING_STATUS_LABEL = Object.fromEntries(BOOKING_STATUSES.map((s) => [s.value, s.label]));
const BOOKING_STATUS_TONE = { pending: "grey", loaded: "amber", in_transit: "blue", arrived: "green" };

const CURRENCIES = ["USD", "GBP", "EUR"];
const CURRENCY_SYMBOL = { USD: "$", GBP: "£", EUR: "€" };
const INCOTERMS = [
  { value: "ex-work", label: "Ex-Work" },
  { value: "delivered", label: "Delivered" },
];
const ORDER_STATUSES = [
  { value: "not_ordered", label: "Not ordered" },
  { value: "sending_order", label: "Sending order" },
  { value: "ordered", label: "Ordered" },
  { value: "received", label: "Received" },
  { value: "floor_stock", label: "Floor stock" },
];
const ORDER_STATUS_LABEL = Object.fromEntries(ORDER_STATUSES.map((s) => [s.value, s.label]));
const ORDER_STATUS_TONE = { not_ordered: "grey", sending_order: "amber", ordered: "blue", received: "green", floor_stock: "green" };
const DOC_STATUS_TONE = { not_applied: "grey", applied: "amber", waiting_delivery: "blue" };
const ROLLUP_TONE = { "Not ordered": "grey", Ordering: "amber", Ordered: "blue", "Partly received": "amber", Received: "green", "Floor stock": "green" };
const PFI_DELIVERY_TYPES = [
  { value: "delivery", label: "Delivery to customer" },
  { value: "collection", label: "Customer collection" },
];
const PO_DELIVERY_TYPES = [
  { value: "ex_work", label: "Ex-Work" },
  { value: "delivery", label: "Delivery" },
  { value: "fob", label: "FOB" },
];
const PO_VEHICLE_TYPES = [
  { value: "container", label: "Container" },
  { value: "uk_local", label: "UK Local Transport" },
  { value: "collection", label: "Collection" },
];
const PO_SUBTYPES = ["20ft Dry", "20ft Reefer", "40ft Dry", "40ft Reefer", "Air Freight", "Collection"];
const CONTAINER_TYPES = ["20ft Dry", "20ft Reefer", "40ft Dry", "40ft Reefer", "40ft HC Dry"];
const SHIPMENT_MODES = [
  { value: "container", label: "Container" },
  { value: "truck", label: "Truck" },
  { value: "uk_delivery", label: "UK Delivery" },
  { value: "air_freight", label: "Air Freight" },
];
const SHIPMENT_SUBTYPES = {
  container: ["20ft Dry", "20ft Reefer", "40ft Dry", "40ft Reefer", "40ft HC Dry"],
  truck: ["Dry Truck", "Reefer Truck"],
  uk_delivery: ["Truck", "Van"],
  air_freight: ["General Cargo", "Temperature Control"],
};
const LOADING_METHODS = ["Palletized", "Handload"];
const VAT_OPTIONS = ["0.0% Z", "5.0%", "20.0% S"];
const VEHICLE_TYPES = [
  { value: "container", label: "Container" },
  { value: "truck", label: "Truck" },
  { value: "uk_delivery", label: "UK Delivery" },
  { value: "air_freight", label: "Air Freight" },
];
const VEHICLE_SUBTYPES = {
  container: ["20ft Dry", "20ft Reefer", "40ft Dry", "40ft HC Dry", "40ft Reefer"],
  truck: ["Dry", "Temperature Controlled"],
  uk_delivery: ["Dry", "Temperature Controlled"],
  air_freight: ["General Cargo", "Temperature Controlled"],
};
const DOC_TYPES = ["COO", "HC", "BL", "SWB", "Free Sale", "PL", "INV"];
const DOC_STATUSES = [
  { value: "not_applied", label: "Have not applied" },
  { value: "applied", label: "Applied" },
  { value: "waiting_delivery", label: "Waiting for Document Delivery" },
];
const DOC_STATUS_LABEL = Object.fromEntries(DOC_STATUSES.map((s) => [s.value, s.label]));
const FIELD_LABEL = {
  orderStatus: "Order status",
  estimatedDeliveryDate: "Estimated delivery date",
  receivedQuantity: "Received quantity",
  receivedDate: "Received date",
  bbdReceived: "BBD received",
};
const SYNCED_FIELDS = ["estimatedDeliveryDate", "receivedQuantity", "receivedDate", "bbdReceived"];

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}
function formatMoney(amount, currency) {
  const sym = CURRENCY_SYMBOL[currency] || "";
  const n = Number(amount || 0);
  return `${sym}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function computeAmount(qty, rate) {
  const q = parseFloat(qty) || 0;
  const r = parseFloat(rate) || 0;
  return +(q * r).toFixed(2);
}
function productTotal(products) {
  return products.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
}
function paymentTotal(payments) {
  return payments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
}
function paymentStatus(total, paid) {
  if (paid <= 0) return "red";
  if (paid >= total && total > 0) return "green";
  return "amber";
}
function paymentStatusLabel(status) {
  return status === "red" ? "Unpaid" : status === "amber" ? "Partial" : "Paid";
}
function emptyPfiDelivery() {
  return {
    type: "delivery", bookedStatus: "not_booked", loaded: "not_loaded",
    vehicleType: "container", subType: VEHICLE_SUBTYPES.container[0],
    loadingDate: "", loadingTime: "",
    collectionDate: "", collectionTime: "",
    etd: "", eta: "",
  };
}
function pfiLabel(pfi) {
  return pfi.pfiNo ? `PFI ${pfi.pfiNo}` : poCode(pfi.id);
}
function poLabel(po) {
  return po.poNo ? `PO ${po.poNo}` : "PO — no number yet";
}
function emptyPoDelivery() {
  return { type: "ex_work", vehicleType: "container", subType: PO_SUBTYPES[0], loadingDate: "", loadingTime: "", etd: "", eta: "" };
}
function poCode(id) {
  return `${id.split("-")[0].toUpperCase()}-${id.slice(-4)}`;
}
function sameName(a, b) {
  return (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase();
}
function numOrNull(v) {
  return v === "" || v === undefined || v === null ? null : Number(v);
}
function receiptPoLabel(r) {
  return r.poNo ? `PO ${r.poNo}` : "Draft PO";
}
function sumAllocated(refs, key) {
  return (refs || []).reduce((acc, r) => {
    const v = numOrNull(r[key]);
    return v === null ? acc : acc + v;
  }, 0);
}

const GlobalStyle = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');

    .sm-root { font-family: 'Inter', sans-serif; background: #F1F8F3; color:#20281F; min-height:100vh; }
    .sm-root * { box-sizing: border-box; }
    .sm-display { font-family: 'Space Grotesk', sans-serif; }
    .sm-mono { font-family: 'IBM Plex Mono', monospace; }

    .login-wrap { min-height:100vh; display:flex; align-items:center; justify-content:center; background: radial-gradient(circle at 20% 20%, #3E8B62 0%, #1F5B3D 60%); padding:24px; }
    .login-card { background:#fff; border-radius:4px; width:100%; max-width:420px; padding:36px 32px; box-shadow: 0 30px 60px rgba(20,60,40,0.28); }
    .login-mark { display:flex; align-items:center; gap:10px; margin-bottom:14px; }
    .login-logo { width:150px; height:auto; }
    .login-title { font-size:22px; font-weight:700; letter-spacing:-0.01em; }
    .login-sub { color:#5B6570; font-size:13px; margin-bottom:26px; }
    .role-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:18px;}
    .role-btn { border:1px solid #D8E6DC; background:#fff; border-radius:3px; padding:12px 6px; font-size:12px; font-weight:600; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:6px; color:#5B6570; transition:.15s; }
    .role-btn:hover { border-color:#2F7A52; color:#1D2226; }
    .role-btn.active { border-color:#2F7A52; background:#E3F3E8; color:#1F5B3D; }
    .field-label { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.06em; color:#5B6570; margin-bottom:6px; display:block; }
    .select-line { width:100%; border:1px solid #D8E6DC; border-radius:3px; padding:10px 12px; font-size:14px; background:#fff; margin-bottom:18px; }
    .btn-enter { width:100%; background:#2F7A52; color:#fff; border:none; border-radius:3px; padding:12px; font-weight:600; font-size:14px; cursor:pointer; letter-spacing:.01em; }
    .btn-enter:hover { background:#24603F; }
    .btn-enter:disabled { opacity:.4; cursor:not-allowed; }
    .login-note { font-size:11px; color:#9AA3A9; margin-top:16px; line-height:1.5; }

    .shell { display:flex; min-height:100vh; }
    .sidebar { width:232px; background:#F5FBF6; border-right:1px solid #D8E6DC; flex-shrink:0; display:flex; flex-direction:column; padding:20px 14px; }
    .brand { display:flex; align-items:center; gap:9px; padding:4px 6px 20px; }
    .brand-logo { width:38px; height:auto; border-radius:3px; flex-shrink:0; }
    .brand-name { font-weight:700; font-size:12.5px; letter-spacing:.01em; color:#12233B; line-height:1.25; }
    .side-section-label { font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:#7C8891; padding:14px 10px 6px; }
    .side-item { display:flex; align-items:center; gap:9px; padding:9px 10px; border-radius:3px; font-size:13px; cursor:pointer; color:#42574A; }
    .side-item:hover { background:#E7F5EA; color:#16281E; }
    .side-item.active { background:#2F7A52; color:#fff; font-weight:600; }
    .side-item .badge-mini { margin-left:auto; background:#C64B4B; color:#fff; font-size:10px; border-radius:8px; padding:1px 6px; }
    .side-spacer { flex:1; }
    .side-user { border-top:1px solid #D8E6DC; padding-top:12px; margin-top:8px; }
    .side-user-name { font-size:12px; font-weight:600; color:#16281E; }
    .side-user-role { font-size:11px; color:#7C8891; margin-bottom:8px; text-transform:capitalize; }
    .logout-btn { display:flex; align-items:center; gap:6px; font-size:12px; color:#5B6570; background:none; border:none; cursor:pointer; padding:6px 4px; }
    .logout-btn:hover { color:#16281E; }

    .main { flex:1; padding:28px 36px; min-width:0; }
    .page-header { display:flex; align-items:baseline; justify-content:space-between; margin-bottom:18px; flex-wrap:wrap; gap:10px; }
    .page-title { font-size:20px; font-weight:700; }
    .page-sub { font-size:12.5px; color:#5B6570; margin-top:2px; }
    .pill-tabs { display:flex; gap:6px; background:#fff; border:1px solid #D8E6DC; border-radius:4px; padding:3px; width:fit-content; margin-bottom:20px; }
    .pill { padding:7px 14px; font-size:12.5px; font-weight:600; border-radius:3px; cursor:pointer; color:#5B6570; }
    .pill.active { background:#2F7A52; color:#fff; }

    .card { background:#fff; border:1px solid #D8E6DC; border-radius:5px; }
    .btn { border:1px solid #D8E6DC; background:#fff; border-radius:3px; padding:8px 14px; font-size:12.5px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:6px; color:#20281F; }
    .btn:hover { border-color:#2F7A52; }
    .btn-accent { background:#2F7A52; color:#fff; border-color:#2F7A52; }
    .btn-accent:hover { background:#24603F; }
    .btn-ghost { border-color:transparent; background:transparent; }
    .btn-sm { padding:5px 10px; font-size:11.5px; }
    .btn-icon { border:none; background:transparent; cursor:pointer; color:#9AA3A9; padding:4px; display:inline-flex; align-items:center; border-radius:3px; }
    .btn-icon:hover { color:#B23B3B; background:#FBE4E1; }
    .btn[disabled] { opacity:.4; cursor:not-allowed; }

    .add-form { padding:18px; border-bottom:1px solid #E5E9E9; background:#F7FBF8; }
    .form-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin-bottom:12px; }
    .form-grid input, .form-grid select, .form-grid textarea { width:100%; border:1px solid #D8E6DC; border-radius:3px; padding:8px 10px; font-size:13px; font-family:inherit; }
    .form-grid label { font-size:11px; font-weight:600; color:#5B6570; margin-bottom:5px; display:block; text-transform:uppercase; letter-spacing:.04em; }

    .cust-table-head { display:grid; grid-template-columns: 1.4fr 1fr 1.3fr 1fr 0.8fr 28px; gap:10px; padding:10px 18px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#7C8891; border-bottom:1px solid #E5E9E9; }
    .cust-row { display:grid; grid-template-columns: 1.4fr 1fr 1.3fr 1fr 0.8fr 28px; gap:10px; padding:14px 18px; align-items:center; border-bottom:1px solid #EEF0EF; cursor:pointer; font-size:13.5px; border-left:3px solid transparent; }
    .cust-row:hover { background:#F7FBF8; }
    .cust-row.open { background:#D7EADD; border-left-color:#2F7A52; border-bottom-color:#BFE3CB; }
    .company-name { font-weight:600; }
    .muted { color:#5B6570; font-size:12.5px; }
    .chev { color:#9AA3A9; transition:.15s; flex-shrink:0; }
    .chev.open { transform:rotate(90deg); }

    .status-dot { width:7px; height:7px; border-radius:50%; display:inline-block; margin-right:5px; }
    .status-dot.draft { background:#B7C0C4; }
    .status-dot.sent { background:#D9A441; }
    .status-dot.answered { background:#3F8F5F; }
    .note-count { display:inline-flex; align-items:center; font-size:12px; font-weight:600; }

    .detail-panel { background:#FCFEFC; padding:18px 24px 22px; border-bottom:1px solid #E5E9E9; border-left:3px solid #2F7A52; }
    .detail-cols { display:grid; grid-template-columns: 1fr 1fr; gap:28px; }
    .detail-heading { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:#7C8891; margin-bottom:10px; }

    .ticket { position:relative; background:#fff; border:1px dashed #C7CDCE; border-left:3px solid #B7C0C4; border-radius:2px; padding:10px 12px; margin-bottom:8px; }
    .ticket.sent { border-left-color:#D9A441; }
    .ticket.answered { border-left-color:#3F8F5F; }
    .ticket-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:5px; gap:10px; }
    .ticket-status { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; }
    .ticket-status.draft { color:#8B959B; }
    .ticket-status.sent { color:#A47521; }
    .ticket-status.answered { color:#2E6E48; }
    .ticket-time { font-size:10.5px; color:#9AA3A9; white-space:nowrap; }
    .ticket-content { font-size:13px; line-height:1.5; margin-bottom:6px; }
    .ticket-answer { background:#F1F6F2; border-radius:3px; padding:8px 10px; font-size:12.5px; margin-top:6px; }
    .ticket-answer-label { font-size:10px; font-weight:700; text-transform:uppercase; color:#2E6E48; margin-bottom:3px; }
    .ticket-actions { display:flex; justify-content:space-between; align-items:center; margin-top:6px; }

    .empty { text-align:center; padding:60px 20px; color:#9AA3A9; }
    .empty svg { margin-bottom:10px; opacity:.5; }

    .placeholder-wrap { padding:60px 30px; text-align:center; color:#5B6570; border:1px dashed #C7CDCE; border-radius:6px; background:#fff; }
    .placeholder-wrap .icon-wrap { width:46px; height:46px; border-radius:50%; background:#E3F3E8; display:flex; align-items:center; justify-content:center; margin:0 auto 14px; color:#1F5B3D; }

    .feed-item { padding:16px 18px; border-bottom:1px solid #EEF0EF; }
    .feed-item.pending { background:#FFFDF7; }
    .feed-top { display:flex; justify-content:space-between; gap:10px; margin-bottom:6px; flex-wrap:wrap; }
    .feed-meta { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .feed-company { font-weight:700; font-size:13.5px; }
    .feed-rep { font-size:11.5px; color:#5B6570; }
    .feed-content { font-size:13.5px; line-height:1.55; margin-bottom:10px; }
    .reply-box { display:flex; gap:8px; }
    .reply-box textarea { flex:1; border:1px solid #D8E6DC; border-radius:3px; padding:8px 10px; font-size:13px; font-family:inherit; resize:vertical; min-height:38px; }

    .badge { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; padding:3px 8px; border-radius:10px; white-space:nowrap; }
    .badge.pending { background:#FBF0DA; color:#A47521; }
    .badge.answered { background:#E1F0E6; color:#2E6E48; }

    .demo-banner { background:#EAF6EE; border:1px solid #BFE3CB; color:#1F5B3D; font-size:11.5px; padding:8px 14px; border-radius:4px; margin-bottom:16px; }

    .pfi-list-head { display:grid; grid-template-columns: 1.3fr .8fr .9fr 1fr .9fr 28px; gap:10px; padding:10px 18px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#7C8891; border-bottom:1px solid #E5E9E9; }
    .pfi-list-row { display:grid; grid-template-columns: 1.3fr .8fr .9fr 1fr .9fr 28px; gap:10px; padding:14px 18px; align-items:center; border-bottom:1px solid #EEF0EF; cursor:pointer; font-size:13.5px; border-left:3px solid transparent; }
    .pfi-list-row:hover { background:#F7FBF8; }
    .pfi-list-row.open { background:#D7EADD; border-left-color:#2F7A52; border-bottom-color:#BFE3CB; }
    .pfi-list-head.has-status, .pfi-list-row.has-status { grid-template-columns: 1.3fr .8fr .9fr 1fr .9fr 1.2fr 28px; }
    .pfi-code { font-family:'IBM Plex Mono', monospace; font-size:11px; font-weight:600; letter-spacing:.02em; color:#1B5138; background:#DCEFE3; border:1px solid #BFE3CB; border-radius:3px; padding:1px 7px; display:inline-block; margin-top:5px; }
    .pfi-list-row.open .pfi-code, .fulfil-card.open .pfi-code { background:#fff; border-color:#8FC5A5; }
    .pfi-detail-wrap { background:#FCFEFC; padding:20px 24px 26px; border-bottom:1px solid #E5E9E9; border-left:3px solid #2F7A52; }
    .section-card { background:#fff; border:1px solid #D8E6DC; border-radius:5px; padding:16px 18px; margin-bottom:14px; }
    .section-title { font-size:11.5px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#1D2226; margin-bottom:12px; display:flex; align-items:center; gap:8px; justify-content:space-between; flex-wrap:wrap; }
    .section-title .actions { display:flex; gap:6px; }

    .table-scroll { overflow-x:auto; margin-bottom:10px; border:1px solid #EEF0EF; border-radius:3px; }
    .data-table { width:100%; border-collapse:collapse; font-size:12px; min-width:1100px; }
    .data-table th { text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:.03em; color:#7C8891; padding:8px 8px; border-bottom:1px solid #E5E9E9; white-space:nowrap; background:#F7FBF8; position:sticky; top:0; }
    .data-table td { padding:6px 8px; border-bottom:1px solid #F1F3F2; white-space:nowrap; }
    .data-table input, .data-table select { border:1px solid #D8E6DC; border-radius:3px; padding:5px 6px; font-size:11.5px; width:100%; min-width:76px; font-family:inherit; }
    .data-table .ro { color:#3A4147; padding:5px 2px; }
    .data-table tr.parent-row td { background:#F2F8F4; font-weight:500; }
    .data-table tr.sub-row td { background:#FBFDFB; border-bottom:1px dashed #DDE6E0; font-size:11px; }
    .data-table tr.sub-row td:first-child { color:#9AA3A9; }
    .po-no-cell { font-weight:700; color:#1F5B3D; }
    .modal-delete { background:rgba(198,75,75,.92); border:none; color:#fff; border-radius:3px; padding:8px 13px; font-size:12.5px; font-weight:600; cursor:pointer; display:inline-flex; gap:6px; align-items:center; margin-left:auto; }
    .modal-delete:hover { background:#B23B3B; }
    .modal-delete + .modal-close { margin-left:8px; }

    .desc-cell { font-size:11px; line-height:1.55; white-space:normal; min-width:190px; }
    .desc-key { color:#7C8891; font-weight:600; }
    .desc-row { display:flex; align-items:center; gap:5px; margin-bottom:3px; }
    .desc-row .desc-key { width:34px; flex-shrink:0; font-size:9.5px; text-transform:uppercase; letter-spacing:.03em; }
    .desc-row input { min-width:0; }
    .sub-arrow { color:#9AA3A9; margin-right:3px; }

    .data-table.sticky-first th:first-child { position:sticky; left:0; z-index:4; background:#EFF6F1; box-shadow:1px 0 0 #D8E6DC; }
    .data-table.sticky-first td:first-child { position:sticky; left:0; z-index:2; background:#fff; box-shadow:1px 0 0 #E5E9E9; }
    .data-table.sticky-first tr.parent-row td:first-child { background:#F2F8F4; }
    .data-table.sticky-first tr.sub-row td:first-child { background:#FBFDFB; }
    .data-table tr.row-hit td { background:#FBF0DA !important; }

    .table-toolbar { display:flex; align-items:center; gap:14px; margin-bottom:8px; flex-wrap:wrap; }
    .search-wrap { position:relative; flex:1; min-width:220px; max-width:360px; }
    .search-icon { position:absolute; left:9px; top:9px; color:#9AA3A9; }
    .search-input { width:100%; border:1px solid #D8E6DC; border-radius:3px; padding:7px 10px 7px 28px; font-size:12.5px; font-family:inherit; }
    .search-panel { position:absolute; z-index:30; top:36px; left:0; right:0; background:#fff; border:1px solid #D8E6DC; border-radius:4px; box-shadow:0 12px 26px rgba(20,60,40,0.14); max-height:230px; overflow-y:auto; }
    .search-option { padding:8px 10px; cursor:pointer; border-bottom:1px solid #F4F5F4; font-size:12.5px; }
    .search-option:last-child { border-bottom:none; }
    .search-option:hover { background:#F1F8F3; }
    .zoom-group { display:flex; align-items:center; gap:5px; }
    .zoom-btn { border:1px solid #D8E6DC; background:#fff; border-radius:3px; width:26px; height:26px; font-size:11px; font-weight:700; cursor:pointer; color:#5B6570; }
    .zoom-btn.on { background:#2F7A52; border-color:#2F7A52; color:#fff; }
    .zoom-sm .data-table, .zoom-sm .data-table input, .zoom-sm .data-table select { font-size:10.5px; }
    .zoom-sm .data-table td { padding:4px 6px; }
    .zoom-lg .data-table, .zoom-lg .data-table input, .zoom-lg .data-table select { font-size:13.5px; }
    .zoom-lg .data-table td { padding:8px 10px; }
    .table-scroll { max-height:60vh; overflow:auto; }

    .booking-head-row { display:grid; grid-template-columns:1.1fr .6fr .8fr 1.3fr 1fr .7fr .7fr .7fr 28px; gap:10px; padding:10px 18px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#7C8891; border-bottom:1px solid #E5E9E9; }
    .booking-row { display:grid; grid-template-columns:1.1fr .6fr .8fr 1.3fr 1fr .7fr .7fr .7fr 28px; gap:10px; padding:13px 18px; align-items:center; border-bottom:1px solid #EEF0EF; cursor:pointer; font-size:13.5px; border-left:3px solid transparent; }
    .booking-row:hover { background:#F7FBF8; }
    .booking-row.open { background:#D7EADD; border-left-color:#2F7A52; border-bottom-color:#BFE3CB; }
    .booking-grid { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:14px; }
    .booking-value { font-size:13px; font-weight:500; padding:6px 0; border-bottom:1px dashed #E0E7E2; min-height:30px; }

    .account-head-row { display:grid; grid-template-columns:.6fr 1.2fr 1fr 1.2fr 40px; gap:10px; padding:10px 18px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#7C8891; border-bottom:1px solid #E5E9E9; }
    .account-row { display:grid; grid-template-columns:.6fr 1.2fr 1fr 1.2fr 40px; gap:10px; padding:10px 18px; align-items:center; border-bottom:1px solid #EEF0EF; font-size:13px; }
    .account-row:last-child { border-bottom:none; }
    .account-row input { width:100%; border:1px solid #D8E6DC; border-radius:3px; padding:7px 9px; font-size:12.5px; font-family:inherit; }

    @media (max-width: 860px) {
      .booking-head-row, .account-head-row { display:none; }
      .booking-row, .account-row { grid-template-columns:1fr; gap:4px; }
      .booking-grid { grid-template-columns:1fr 1fr; }
    }

    .overview-bar { display:flex; align-items:center; gap:12px; margin-bottom:12px; flex-wrap:wrap; }
    .overview-bar .find-bar { flex:1; min-width:240px; }
    .find-bar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }

    .save-bar { position:sticky; top:0; z-index:12; display:flex; align-items:center; gap:10px; flex-wrap:wrap; background:#fff; border:1px solid #D8E6DC; border-radius:5px; padding:10px 14px; margin-bottom:14px; box-shadow:0 2px 10px rgba(20,60,40,0.06); }

    .reorder-panel { background:#fff; border:1px solid #F3C6C1; border-radius:5px; margin-bottom:16px; }
    .reorder-head { display:flex; align-items:center; gap:8px; padding:12px 16px; border-bottom:1px solid #FBE4E1; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; color:#B23B3B; background:#FDF3F1; }
    .reorder-scroll { max-height:230px; overflow-y:auto; }
    .reorder-row { display:flex; align-items:center; gap:12px; padding:11px 16px; border-bottom:1px solid #F4F5F4; cursor:pointer; font-size:12.5px; }
    .reorder-row:last-child { border-bottom:none; }
    .reorder-row:hover { background:#FFF9F8; }
    .reorder-row.handled { opacity:.55; }
    .reorder-qty { font-weight:700; color:#B23B3B; white-space:nowrap; }
    .reorder-main { flex:1; }

    .tone-grey { color:#7C8891; font-weight:600; }
    .tone-amber { color:#A47521; font-weight:600; }
    .tone-blue { color:#2A5FA8; font-weight:600; }
    .tone-green { color:#2E6E48; font-weight:600; }
    .tone-red { color:#B23B3B; font-weight:600; }
    select.tone-grey { color:#7C8891; }
    select.tone-amber { color:#A47521; background:#FDF8EC; border-color:#EAD9AE; }
    select.tone-blue { color:#2A5FA8; background:#EEF4FC; border-color:#C5D8F0; }
    select.tone-green { color:#2E6E48; background:#EDF7F0; border-color:#BFE3CB; }

    .import-note { font-size:11.5px; margin:8px 0 0; padding:8px 10px; border-radius:3px; }
    .import-note.ok { background:#EAF6EE; color:#1F5B3D; border:1px solid #BFE3CB; }
    .import-note.err { background:#FBE4E1; color:#B23B3B; border:1px solid #F3C6C1; }
    .import-note.busy { background:#FBF0DA; color:#A47521; border:1px solid #EAD9AE; }
    .alloc-note { font-size:10px; color:#7C8891; margin-top:4px; }

    .lane-head-row { display:grid; grid-template-columns:1.1fr 1.6fr .9fr .8fr .8fr 1.1fr 28px; gap:10px; padding:10px 18px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#7C8891; border-bottom:1px solid #E5E9E9; }
    .lane-row { display:grid; grid-template-columns:1.1fr 1.6fr .9fr .8fr .8fr 1.1fr 28px; gap:10px; padding:13px 18px; align-items:center; border-bottom:1px solid #EEF0EF; cursor:pointer; font-size:13.5px; border-left:3px solid transparent; }
    .lane-row:hover { background:#F7FBF8; }
    .lane-row.open { background:#D7EADD; border-left-color:#2F7A52; border-bottom-color:#BFE3CB; }
    .lane-detail { background:#FCFEFC; border-left:3px solid #2F7A52; border-bottom:1px solid #E5E9E9; padding:16px 20px 18px; }

    @media (max-width: 860px) {
      .lane-head-row { display:none; }
      .lane-row { grid-template-columns:1fr; gap:4px; }
    }

    .mini-form-row { display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end; margin-top:8px; }
    .mini-field { display:flex; flex-direction:column; gap:4px; }
    .mini-field label { font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; color:#7C8891; }
    .mini-field input, .mini-field select, .mini-field textarea { border:1px solid #D8E6DC; border-radius:3px; padding:7px 9px; font-size:12.5px; font-family:inherit; }

    .doc-card { border:1px dashed #C7CDCE; border-radius:3px; padding:10px 12px; margin-bottom:8px; display:flex; justify-content:space-between; gap:10px; align-items:flex-start; }
    .doc-type-badge { font-size:10px; font-weight:700; background:#2F7A52; color:#fff; padding:2px 8px; border-radius:3px; letter-spacing:.04em; flex-shrink:0; }
    .doc-content { font-size:12.5px; line-height:1.5; margin-top:6px; }
    .doc-file-link { font-size:11.5px; color:#1F5B3D; display:inline-flex; align-items:center; gap:4px; margin-top:6px; }
    .doc-status-row { margin-top:8px; display:flex; align-items:center; gap:8px; }

    .reorder-btn { font-size:10.5px; padding:3px 8px; border-radius:3px; border:1px solid #C64B4B; color:#C64B4B; background:#fff; cursor:pointer; font-weight:700; display:inline-flex; align-items:center; gap:4px; }
    .reorder-btn.active { background:#C64B4B; color:#fff; }

    .chip { font-size:10px; font-weight:700; padding:3px 9px; border-radius:10px; text-transform:uppercase; letter-spacing:.04em; display:inline-block; white-space:nowrap; }
    .chip.red { background:#FBE4E1; color:#B23B3B; }
    .chip.amber { background:#FBF0DA; color:#A47521; }
    .chip.green { background:#E1F0E6; color:#2E6E48; }
    .chip.gray { background:#EDEFEE; color:#7C8891; }
    .chip.blue { background:#DDEAF7; color:#2B5A8A; }
    .jobs-head-row { display:grid; grid-template-columns: 100px 2fr 2fr 110px 80px 64px 28px; gap:10px; padding:10px 18px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#7C8891; border-bottom:1px solid #E5E9E9; }
    .jobs-row { display:grid; grid-template-columns: 100px 2fr 2fr 110px 80px 64px 28px; gap:10px; padding:12px 18px; align-items:center; border-bottom:1px solid #EEF0EF; cursor:pointer; font-size:13.5px; border-left:3px solid transparent; }
    .jobs-row:hover { background:#F7FBF8; }
    .jobs-row.open { background:#D7EADD; border-left-color:#2F7A52; border-bottom-color:#BFE3CB; }
    .row-done .ro { color:#9AA3A9; }
    .import-agent-link { color:#2F7A52; font-weight:700; margin-left:6px; }
    .agent-pdf { border:1px solid #BFE3CB; background:#F1F6F2; border-radius:6px; padding:14px 16px; margin-bottom:16px; }
    .agent-pdf h3 { margin:0 0 6px; font-size:14px; }
    .agent-pdf .agent-pdf-row { display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap; margin:8px 0; }
    .agent-pdf pre { background:#fff; border:1px solid #D8E6DC; border-radius:4px; padding:10px 12px; font-size:12.5px; white-space:pre-wrap; margin:6px 0; font-family:inherit; line-height:1.5; }
    .cal-toolbar { display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:12px; flex-wrap:wrap; }
    .cal-title { font-size:18px; font-weight:700; min-width:180px; }
    .cal-nav { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
    .cal-legend { display:flex; gap:12px; font-size:11.5px; color:#5B6570; align-items:center; }
    .cal-head { display:grid; grid-template-columns:repeat(7,1fr); font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#7C8891; border-bottom:1px solid #E5E9E9; }
    .cal-head div { padding:10px 10px; }
    .cal-grid { display:grid; grid-template-columns:repeat(7,1fr); }
    .cal-day { min-height:112px; border-right:1px solid #EEF0EF; border-bottom:1px solid #EEF0EF; padding:6px 6px 8px; display:flex; flex-direction:column; gap:3px; background:#fff; }
    .cal-day:nth-child(7n) { border-right:none; }
    .cal-day.out { background:#FAFBFA; }
    .cal-day.out .cal-date { color:#B6BEC2; }
    .cal-day-top { display:flex; justify-content:space-between; align-items:center; }
    .cal-date { font-size:12px; font-weight:600; padding:1px 7px; border-radius:12px; }
    .cal-day.today .cal-date { background:#2F7A52; color:#fff; }
    .cal-add { border:none; background:transparent; color:#9AA3A9; cursor:pointer; font-size:15px; line-height:1; padding:0 5px; border-radius:3px; opacity:0; font-family:inherit; }
    .cal-day:hover .cal-add, .cal-add:focus { opacity:1; }
    .cal-add:hover { background:#E7F5EA; color:#2F7A52; }
    .cal-event { display:flex; align-items:center; gap:5px; width:100%; text-align:left; border:none; background:#F1F6F2; border-radius:3px; padding:3px 6px; font-size:11.5px; cursor:pointer; font-family:inherit; color:#16281E; min-width:0; }
    .cal-event span.cal-text { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
    .cal-event:hover { background:#D7EADD; }
    .cal-dot { width:7px; height:7px; border-radius:50%; flex:none; background:#7C8891; }
    .cal-event.type-delivery .cal-dot { background:#2B5A8A; }
    .cal-event.type-collection .cal-dot { background:#A47521; }
    .cal-more { border:none; background:transparent; color:#2F7A52; font-size:11px; cursor:pointer; text-align:left; padding:2px 6px; font-family:inherit; font-weight:600; }
    .cal-more:hover { text-decoration:underline; }
    .agent-card { padding:18px 22px; }
    .agent-lead { font-size:15px; margin-bottom:6px; line-height:1.6; }
    .agent-lead code, .agent-note code, .agent-steps code, .agent-foot code { background:#F1F6F2; padding:1px 6px; border-radius:3px; font-size:12.5px; }
    .agent-note { font-size:12.5px; margin-bottom:14px; line-height:1.5; }
    .agent-pass { max-width:340px; margin-bottom:16px; }
    .agent-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:22px; margin-bottom:16px; }
    .agent-grid h3 { font-size:14px; margin:0 0 8px; }
    .agent-grid p { font-size:12.5px; line-height:1.55; margin:0 0 8px; }
    .agent-cmd { background:#1F2A24; color:#E8F0EA; border-radius:6px; padding:12px 14px; font-family:ui-monospace,Menlo,Consolas,monospace; font-size:12px; white-space:pre-wrap; word-break:break-all; margin:0 0 8px; }
    .agent-claude-btn { display:inline-block; background:#B5432E; color:#fff; font-weight:700; padding:10px 16px; border-radius:6px; text-decoration:none; margin-bottom:10px; font-size:14px; }
    .agent-claude-btn:hover { background:#9C3826; }
    .agent-steps { padding-left:18px; font-size:12.5px; line-height:1.55; margin:0; }
    .agent-steps li { margin-bottom:6px; }
    .agent-foot { font-size:12px; line-height:1.6; border-top:1px solid #EEF0EF; padding-top:12px; display:flex; flex-direction:column; gap:4px; }
    .agent-phases { list-style:none; padding:0; margin:0 0 16px; display:flex; flex-direction:column; gap:14px; }
    .agent-phase { border:1px solid #E5E9E9; border-radius:6px; padding:14px 16px; background:#fff; }
    .agent-phase-head { display:flex; gap:12px; align-items:flex-start; margin-bottom:10px; font-size:14px; }
    .agent-phase-head .muted { font-size:12.5px; font-weight:400; }
    .agent-phase-no { flex:none; width:26px; height:26px; border-radius:50%; background:#2F7A52; color:#fff; font-weight:700; font-size:13px; display:inline-flex; align-items:center; justify-content:center; }
    .agent-pick { display:flex; gap:8px; flex-wrap:wrap; }
    .agent-pick .pill { display:flex; flex-direction:column; align-items:flex-start; gap:2px; padding:8px 14px; border:1px solid #D8E6DC; font-family:inherit; cursor:pointer; }
    .agent-pick .pill.active { border-color:#2F7A52; }
    .agent-pick-hint { font-size:11px; font-weight:400; opacity:.85; }
    .agent-keyrow { display:grid; grid-template-columns:200px 240px 1fr; gap:14px; margin-bottom:10px; }
    .agent-keybox { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding-top:6px; }
    .agent-testrow { display:flex; align-items:center; gap:12px; flex-wrap:wrap; font-size:12.5px; }
    .agent-test-result { font-weight:600; }
    .agent-test-result.ok { color:#2E6E48; }
    .agent-test-result.err { color:#B23B3B; }
    .agent-test-result.busy { color:#7C8891; }
    .agent-substeps { padding-left:20px; margin:0; font-size:13px; line-height:1.6; }
    .agent-substeps li { margin-bottom:8px; }
    .agent-substeps li.agent-warn { list-style:none; margin-left:-20px; color:#A47521; font-weight:600; }
    .agent-substeps .agent-cmd { margin:6px 0; }
    .agent-substeps .agent-claude-btn { margin:0 4px; padding:6px 12px; font-size:13px; }
    .agent-fix { margin-top:10px; font-size:12.5px; }
    .agent-examples { padding-left:18px; margin:0 0 10px; font-size:13px; line-height:1.7; }
    .agent-limits { font-size:12.5px; line-height:1.5; }
    .agent-quick { margin-bottom:14px; }
    .agent-quick summary { cursor:pointer; font-size:13px; font-weight:600; color:#2F7A52; margin-bottom:10px; }
    .date-field { display:inline-flex; align-items:center; gap:2px; max-width:100%; }
    .date-field input[type="text"] { min-width:96px; flex:1; }
    .date-field.invalid input[type="text"] { border-color:#B23B3B; background:#FFF7F6; }
    .date-pick-btn { position:relative; display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; flex:none; color:#7C8891; cursor:pointer; }
    .date-pick-btn:hover { color:#2F7A52; }
    .date-field .date-picker, .data-table .date-field .date-picker, .mini-field .date-field .date-picker, .booking-grid .date-field .date-picker, .form-grid .date-field .date-picker { position:absolute; inset:0; width:100%; min-width:0; height:100%; margin:0; padding:0; border:none; opacity:0; cursor:pointer; }
    .data-table .date-field input[type="text"] { width:auto; min-width:86px; }

    .toggle-pair { display:flex; gap:6px; }
    .toggle-btn { border:1px solid #D8E6DC; background:#fff; border-radius:3px; padding:6px 12px; font-size:11.5px; font-weight:700; cursor:pointer; text-transform:uppercase; letter-spacing:.03em; }
    .toggle-btn.sent-on { background:#E1F0E6; color:#2E6E48; border-color:#BFE3CB; }
    .toggle-btn.notsent-on { background:#FBE4E1; color:#B23B3B; border-color:#F3C6C1; }

    .pay-summary { display:flex; gap:22px; flex-wrap:wrap; margin-bottom:12px; }
    .pay-stat-label { font-size:10px; text-transform:uppercase; letter-spacing:.05em; color:#7C8891; margin-bottom:3px; }
    .pay-stat-value { font-size:15px; font-weight:700; font-family:'IBM Plex Mono', monospace; }

    .fulfil-card { border-bottom:1px solid #EEF0EF; padding:14px 18px; border-left:3px solid transparent; }
    .fulfil-card:last-child { border-bottom:none; }
    .fulfil-card.open { background:#FCFEFC; border-left-color:#2F7A52; }
    .fulfil-head { display:flex; justify-content:space-between; align-items:center; cursor:pointer; gap:10px; flex-wrap:wrap; }
    .fulfil-card.open .fulfil-head { background:#D7EADD; margin:-14px -18px 0; padding:14px 18px; }

    .activity-panel { background:#fff; border:1px solid #D8E6DC; border-radius:5px; margin-bottom:16px; }
    .activity-panel-head { display:flex; align-items:center; gap:8px; padding:12px 16px; border-bottom:1px solid #EEF0EF; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; color:#5B6570; }
    .activity-row { display:flex; align-items:center; gap:10px; padding:10px 16px; border-bottom:1px solid #F4F5F4; cursor:pointer; font-size:12.5px; }
    .activity-row:last-child { border-bottom:none; }
    .activity-row:hover { background:#F7FBF8; }
    .activity-dot { width:7px; height:7px; border-radius:50%; background:#2F7A52; flex-shrink:0; }
    .activity-dot.seen { background:#DADFE0; }
    .activity-text { flex:1; }
    .activity-empty { padding:16px; text-align:center; color:#9AA3A9; font-size:12.5px; }

    .supplier-row { display:grid; grid-template-columns: 1.4fr 1.6fr 0.8fr; gap:10px; padding:14px 18px; align-items:center; border-bottom:1px solid #EEF0EF; font-size:13.5px; }
    .supplier-head { display:grid; grid-template-columns: 1.4fr 1.6fr 0.8fr; gap:10px; padding:10px 18px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#7C8891; border-bottom:1px solid #E5E9E9; }

    .assign-bar { background:#EAF6EE; border:1px solid #BFE3CB; border-radius:5px; padding:12px 16px; margin-bottom:14px; display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
    .assign-bar strong { color:#1F5B3D; }

    .pfi-link-details { position:relative; }
    .pfi-link-details summary { cursor:pointer; font-size:11px; color:#1F5B3D; font-weight:600; list-style:none; }
    .pfi-link-details summary::-webkit-details-marker { display:none; }
    .pfi-link-panel { position:absolute; z-index:5; background:#fff; border:1px solid #D8E6DC; border-radius:4px; padding:8px; margin-top:4px; min-width:200px; box-shadow:0 8px 20px rgba(0,0,0,0.08); }
    .pfi-link-option { display:flex; align-items:center; gap:6px; font-size:11.5px; padding:4px 2px; white-space:normal; }

    .activity-scroll { max-height:216px; overflow-y:auto; }

    .modal-backdrop { position:fixed; top:0; right:0; bottom:0; left:0; background:rgba(14,38,26,0.48); z-index:50; display:flex; align-items:flex-start; justify-content:center; padding:28px 18px; overflow-y:auto; }
    .modal-panel { background:#F4FAF6; border-radius:6px; width:100%; max-width:1180px; box-shadow:0 30px 70px rgba(8,36,22,0.4); overflow:hidden; }
    .modal-head { background:#1F5B3D; color:#fff; padding:15px 22px; display:flex; align-items:center; gap:16px; flex-wrap:wrap; }
    .modal-title { font-size:19px; font-weight:700; letter-spacing:-.01em; }
    .modal-sub { font-size:12.5px; color:#B8DFC6; margin-top:2px; }
    .modal-close { margin-left:auto; background:rgba(255,255,255,.16); border:none; color:#fff; border-radius:3px; padding:8px 13px; font-size:12.5px; font-weight:600; cursor:pointer; display:inline-flex; gap:6px; align-items:center; }
    .modal-close:hover { background:rgba(255,255,255,.3); }
    .modal-body { padding:20px 22px 24px; }
    .detail-body { padding:0; }

    .pfi-picker-trigger { border:1px solid #D8E6DC; background:#fff; border-radius:3px; padding:5px 8px; font-size:11.5px; cursor:pointer; color:#1F5B3D; font-weight:600; white-space:nowrap; }
    .pfi-picker-trigger:hover { border-color:#2F7A52; }
    .pfi-picker-panel { background:#fff; border:1px solid #D8E6DC; border-radius:4px; width:260px; box-shadow:0 12px 28px rgba(20,60,40,0.16); overflow:hidden; }
    .pfi-picker-search { width:100%; border:none; border-bottom:1px solid #EEF0EF; padding:9px 10px; font-size:12.5px; font-family:inherit; outline:none; }
    .pfi-picker-list { max-height:190px; overflow-y:auto; }
    .pfi-picker-option { display:flex; align-items:center; gap:7px; font-size:12px; padding:7px 10px; white-space:normal; cursor:pointer; }
    .pfi-picker-option:hover { background:#F1F8F3; }
    .pfi-picker-option input { width:auto; min-width:0; }
    .picker-backdrop { position:fixed; top:0; right:0; bottom:0; left:0; z-index:60; }

    .delivery-block { border-top:1px solid #EEF0EF; padding-top:11px; margin-top:12px; }
    .delivery-block-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#7C8891; margin-bottom:7px; }
    .delivery-readonly { font-size:13px; line-height:1.9; }
    .po-status-bar { display:flex; gap:20px; flex-wrap:wrap; align-items:center; background:#fff; border:1px solid #D8E6DC; border-radius:5px; padding:12px 16px; margin-bottom:14px; }
    .po-status-item { display:flex; flex-direction:column; gap:6px; }
    .po-status-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#7C8891; }

    @media (max-width: 860px) {
      .shell { flex-direction:column; }
      .sidebar { width:100%; flex-direction:row; flex-wrap:wrap; }
      .side-spacer { display:none; }
      .main { padding:18px; }
      .detail-cols { grid-template-columns:1fr; }
      .form-grid { grid-template-columns:1fr; }
      .cust-table-head, .pfi-list-head, .supplier-head { display:none; }
      .cust-row, .pfi-list-row, .pfi-list-row.has-status, .supplier-row, .jobs-row { grid-template-columns:1fr; gap:4px; }
      .jobs-head-row { display:none; }
      .agent-grid { grid-template-columns:1fr; }
      .agent-keyrow { grid-template-columns:1fr; }
      .cal-scroll { overflow-x:auto; }
      .cal-head, .cal-grid { min-width:680px; }
      .cal-day { min-height:80px; padding:4px; }
      .cal-add { opacity:1; }
      .cal-event { font-size:10.5px; padding:2px 4px; }
      .cal-head div { padding:8px 4px; }
    }
  `}</style>
);

/* Typed dd/mm/yyyy field that stores ISO; the small native picker beside it is optional. */
function DateField({ value, onChange, style, className, placeholder = "dd/mm/yyyy" }) {
  const [text, setText] = useState(fmtDate(value));
  const [invalid, setInvalid] = useState(false);
  React.useEffect(() => { setText(fmtDate(value)); setInvalid(false); }, [value]);
  const commit = () => {
    const iso = parseDmy(text);
    if (iso === null) { setInvalid(true); setText(fmtDate(value)); return; } // show the stored value again, flagged, so a form never saves over garbage
    setInvalid(false);
    if (iso !== (value || "")) onChange(iso);
    setText(fmtDate(iso));
  };
  return (
    <span className={`date-field ${invalid ? "invalid" : ""} ${className || ""}`} style={style}>
      <input
        type="text"
        inputMode="numeric"
        placeholder={placeholder}
        title={invalid ? "That was not a date — use dd/mm/yyyy (the previous value was kept)" : undefined}
        aria-invalid={invalid || undefined}
        value={text}
        onChange={(e) => { setText(e.target.value); if (invalid) setInvalid(false); }}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
      />
      <span className="date-pick-btn" title="Pick a date">
        <CalendarDays size={13} />
        <input type="date" className="date-picker" tabIndex={-1} aria-label="Pick a date" value={value || ""} onChange={(e) => { setInvalid(false); onChange(e.target.value); }} />
      </span>
    </span>
  );
}

function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async () => {
    try {
      await onLogin(username, password);
      setError("");
    } catch (err) {
      setError(err && err.status === 401 ? "Wrong username or password." : "Could not sign in. Please try again.");
    }
  };

  return (
    <div className="sm-root">
      <GlobalStyle />
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-mark">
            <img className="login-logo" src={LOGO_SRC} alt="FMCG Trading Ltd" />
          </div>
          <div className="login-title sm-display">Sale &amp; Buying Console</div>
          <div className="login-sub">Sign in with the account your administrator gave you</div>

          <span className="field-label">Username</span>
          <input
            className="select-line"
            autoFocus
            value={username}
            onChange={(e) => { setUsername(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />

          <span className="field-label">Password</span>
          <input
            className="select-line"
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />

          {error && <div style={{ color: "#B23B3B", fontSize: 12.5, marginBottom: 12 }}>{error}</div>}

          <button className="btn-enter" disabled={!username || !password} onClick={submit}>Sign in</button>
          <div className="login-note">
            Sale and Buyer accounts are created by the administrator in the Accounts tab.
          </div>
        </div>
      </div>
    </div>
  );
}

function NoteSummary({ notes }) {
  if (!notes || notes.length === 0) return <span className="muted">None</span>;
  const sent = notes.filter((n) => n.status === "sent").length;
  const answered = notes.filter((n) => n.status === "answered").length;
  const draft = notes.filter((n) => n.status === "draft").length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {sent > 0 && <span className="note-count"><span className="status-dot sent" />{sent} awaiting Buyer</span>}
      {answered > 0 && <span className="note-count"><span className="status-dot answered" />{answered} answered</span>}
      {draft > 0 && <span className="note-count"><span className="status-dot draft" />{draft} draft</span>}
    </div>
  );
}

/* ---------------- Modal ---------------- */

function Modal({ title, subtitle, onDelete, deleteLabel, onClose, children }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title sm-display">{title}</div>
            {subtitle && <div className="modal-sub">{subtitle}</div>}
          </div>
          {onDelete && (
            confirming ? (
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12.5 }}>Delete for good?</span>
                <button className="modal-delete" style={{ marginLeft: 0 }} onClick={onDelete}><Trash2 size={14} /> Yes, delete</button>
                <button className="modal-close" style={{ marginLeft: 0 }} onClick={() => setConfirming(false)}>Keep</button>
              </div>
            ) : (
              <button className="modal-delete" onClick={() => setConfirming(true)}><Trash2 size={14} /> {deleteLabel}</button>
            )
          )}
          <button className="modal-close" onClick={onClose}><X size={14} /> Close</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/* ---------------- Activity panel (shared) ---------------- */

function ActivityPanel({ title, items, onItemClick, emptyText }) {
  if (items.length === 0) {
    return (
      <div className="activity-panel">
        <div className="activity-panel-head"><Bell size={13} /> {title}</div>
        <div className="activity-empty">{emptyText}</div>
      </div>
    );
  }
  return (
    <div className="activity-panel">
      <div className="activity-panel-head"><Bell size={13} /> {title}</div>
      <div className="activity-scroll">
        {items.map((item) => (
          <div key={item.id} className="activity-row" onClick={() => onItemClick(item)}>
            <span className={`activity-dot ${item.seen ? "seen" : ""}`} />
            <span className="activity-text">{item.text}</span>
            <span className="ticket-time sm-mono">{timeAgo(item.createdAt)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Customer tab (Sale) ---------------- */

function CustomerDetail({ customer, pfis, onAddNote, onSendExisting, onDeleteNote, onOpenPfi }) {
  const [text, setText] = useState("");
  const [notify, setNotify] = useState(true);

  const submit = () => {
    if (!text.trim()) return;
    onAddNote(text, notify);
    setText("");
  };

  return (
    <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
      <div className="detail-cols">
        <div>
          <div className="detail-heading">Info needed from Buyer</div>
          {customer.notes.length === 0 && <div className="muted" style={{ marginBottom: 10 }}>No items yet.</div>}
          {customer.notes.map((n) => (
            <div key={n.id} className={`ticket ${n.status}`}>
              <div className="ticket-top">
                <span className={`ticket-status ${n.status}`}>
                  {n.status === "draft" ? "Draft" : n.status === "sent" ? "Awaiting Buyer" : "Buyer replied"}
                </span>
                <span className="ticket-time sm-mono">{timeAgo(n.createdAt)}</span>
              </div>
              <div className="ticket-content">{n.content}</div>
              {n.status === "answered" && (
                <div className="ticket-answer">
                  <div className="ticket-answer-label">Buyer replied · {timeAgo(n.answeredAt)}</div>
                  {n.answer}
                </div>
              )}
              <div className="ticket-actions">
                {n.status === "draft" ? (
                  <button className="btn btn-sm" onClick={() => onSendExisting(n.id)}><Send size={12} /> Notify Buyer</button>
                ) : <span />}
                <button className="btn-icon" title="Remove this request" onClick={() => onDeleteNote(n.id)}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}

          <div style={{ marginTop: 12 }}>
            <textarea
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              style={{ width: "100%", border: "1px solid #D8E6DC", borderRadius: 3, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", marginBottom: 8 }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#5B6570" }}>
                <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Notify Buyer now
              </label>
              <button className="btn btn-accent btn-sm" onClick={submit}><Plus size={12} /> Add info</button>
            </div>
          </div>
        </div>

        <div>
          <div className="detail-heading">PFI for this customer</div>
          {pfis.length === 0 ? (
            <div className="placeholder-wrap" style={{ padding: "26px 16px" }}>
              <div className="icon-wrap" style={{ width: 36, height: 36 }}><FileText size={16} /></div>
              <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>No PFI yet for this customer. Create one in the Order Tracking tab.</div>
            </div>
          ) : (
            <div className="card">
              {pfis.map((p) => {
                const total = productTotal(p.products);
                const paid = paymentTotal(p.payments);
                const status = paymentStatus(total, paid);
                return (
                  <div key={p.id} className="pfi-list-row" style={{ gridTemplateColumns: "1fr auto auto 20px" }} onClick={() => onOpenPfi(p.id)}>
                    <div>
                      <div className="pfi-code">{pfiLabel(p)}</div>
                      <div className="muted">{p.products.length} product line(s) · {formatMoney(total, p.currency)}</div>
                    </div>
                    <span className={`chip ${status}`}>{paymentStatusLabel(status)}</span>
                    <ChevronRight size={14} className="chev" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CustomerTab({ saleId, saleName, customers, pfisForSale, addCustomer, addNote, sendExisting, deleteNote, markSeen, onOpenPfi }) {
  const [showAdd, setShowAdd] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [find, setFind] = useState("");
  const [form, setForm] = useState({ companyName: "", groupChatName: "", productsUsual: "" });

  const fq = find.trim().toLowerCase();
  const visibleCustomers = fq
    ? customers.filter((c) => [c.companyName, c.groupChatName].some((f) => String(f || "").toLowerCase().includes(fq)))
    : customers;

  const handleAddCustomer = () => {
    if (!form.companyName.trim()) return;
    const newId = addCustomer(saleId, {
      companyName: form.companyName.trim(),
      groupChatName: form.groupChatName.trim(),
      productsUsual: form.productsUsual.trim(),
    });
    setForm({ companyName: "", groupChatName: "", productsUsual: "" });
    setShowAdd(false);
    setExpandedId(newId);
  };

  const toggleExpand = (customerId) => {
    const willOpen = expandedId !== customerId;
    setExpandedId(willOpen ? customerId : null);
    if (willOpen) markSeen(saleId, customerId);
  };

  return (
    <div>
      <div className="overview-bar">
        <FindBar
          value={find}
          onChange={setFind}
          placeholder="Find a customer by company or group chat name…"
          total={customers.length}
          shown={visibleCustomers.length}
        />
        <button className="btn btn-accent" onClick={() => setShowAdd((s) => !s)}><Plus size={14} /> Add customer</button>
      </div>

      <div className="card">
        {showAdd && (
          <div className="add-form">
            <div className="form-grid">
              <div>
                <label>Company name</label>
                <input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
              </div>
              <div>
                <label>Group chat name</label>
                <input value={form.groupChatName} onChange={(e) => setForm({ ...form, groupChatName: e.target.value })} />
              </div>
              <div>
                <label>Products usually ordered</label>
                <input value={form.productsUsual} onChange={(e) => setForm({ ...form, productsUsual: e.target.value })} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-accent" onClick={handleAddCustomer}>Save customer</button>
              <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </div>
        )}

        {visibleCustomers.length === 0 && !showAdd ? (
          <div className="empty">
            <Building2 size={30} />
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{fq ? "No customer matches that search" : "No customers yet"}</div>
            <div style={{ fontSize: 12.5 }}>{fq ? "Try part of the company or group chat name." : 'Click "Add customer" to start tracking.'}</div>
          </div>
        ) : (
          <>
            <div className="cust-table-head">
              <div>Company</div>
              <div>Group chat</div>
              <div>Products</div>
              <div>Notifications</div>
              <div>PFI</div>
              <div />
            </div>
            {visibleCustomers.map((c) => {
              const pfisOfCustomer = pfisForSale.filter((p) => p.customerId === c.id);
              return (
                <React.Fragment key={c.id}>
                  <div className={`cust-row ${expandedId === c.id ? "open" : ""}`} onClick={() => toggleExpand(c.id)}>
                    <div className="company-name">{c.companyName}</div>
                    <div className="muted">{c.groupChatName || "—"}</div>
                    <div className="muted">{c.productsUsual || "—"}</div>
                    <div><NoteSummary notes={c.notes} /></div>
                    <div className="muted">{pfisOfCustomer.length > 0 ? `${pfisOfCustomer.length} PFI` : "—"}</div>
                    <ChevronRight size={16} className={`chev ${expandedId === c.id ? "open" : ""}`} />
                  </div>
                  {expandedId === c.id && (
                    <CustomerDetail
                      customer={c}
                      pfis={pfisOfCustomer}
                      onAddNote={(content, notify) => addNote(saleId, c.id, content, notify, saleName)}
                      onSendExisting={(noteId) => sendExisting(saleId, c.id, noteId, saleName)}
                      onDeleteNote={(noteId) => deleteNote(saleId, c.id, noteId)}
                      onOpenPfi={onOpenPfi}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------- Buyer feed (Customer Q&A) ---------------- */

function BuyerFeed({ feed, answerFeedItem, deleteFeedItem }) {
  const [replies, setReplies] = useState({});

  const submitReply = (item) => {
    const answer = (replies[item.id] || "").trim();
    if (!answer) return;
    answerFeedItem(item.id, answer);
    setReplies((r) => ({ ...r, [item.id]: "" }));
  };

  if (feed.length === 0) {
    return (
      <div className="card">
        <div className="empty">
          <Inbox size={30} />
          <div style={{ fontWeight: 600 }}>Inbox is empty</div>
          <div style={{ fontSize: 12.5 }}>Notifications from Sale will appear here.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      {feed.map((item) => (
        <div key={item.id} className={`feed-item ${item.status === "sent" ? "pending" : ""}`}>
          <div className="feed-top">
            <div className="feed-meta">
              <span className="feed-company">{item.companyName}</span>
              <span className="feed-rep">from {item.saleName}</span>
              <span className={`badge ${item.status === "sent" ? "pending" : "answered"}`}>{item.status === "sent" ? "Needs reply" : "Replied"}</span>
            </div>
            <span className="ticket-time sm-mono">{timeAgo(item.createdAt)}</span>
          </div>
          <div className="feed-content">{item.content}</div>
          {item.status === "sent" ? (
            <div className="reply-box">
              <textarea rows={1} value={replies[item.id] || ""} onChange={(e) => setReplies((r) => ({ ...r, [item.id]: e.target.value }))} />
              <button className="btn btn-accent btn-sm" onClick={() => submitReply(item)}><Send size={12} /> Send</button>
            </div>
          ) : (
            <div>
              <div className="ticket-answer">
                <div className="ticket-answer-label">Your reply · {timeAgo(item.answeredAt)}</div>
                {item.answer}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                <button className="btn-icon" title="Remove from inbox" onClick={() => deleteFeedItem(item.id)}><Trash2 size={14} /></button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------------- PFI picker (search by number, scrollable list) ---------------- */

function PfiLinkPicker({ options, selected, onToggle }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [anchor, setAnchor] = useState(null);
  const triggerRef = useRef(null);

  const openPanel = () => {
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setAnchor({ top: r.bottom + 4, left: Math.min(r.left, window.innerWidth - 276) });
    }
    setQuery("");
    setOpen(true);
  };

  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter((o) => o.search.toLowerCase().includes(q)) : options;
  const selectedLabels = options.filter((o) => selected.some((r) => r.pfiId === o.pfiId)).map((o) => o.shortLabel);

  return (
    <>
      <button ref={triggerRef} className="pfi-picker-trigger" onClick={openPanel}>
        {selectedLabels.length > 0 ? selectedLabels.join(", ") : "Link PFI"}
      </button>

      {open && anchor && (
        <>
          <div className="picker-backdrop" onClick={() => setOpen(false)} />
          <div className="pfi-picker-panel" style={{ position: "fixed", top: anchor.top, left: anchor.left, zIndex: 61 }}>
            <input
              className="pfi-picker-search"
              autoFocus
              placeholder="Type a PFI number, e.g. 3200"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="pfi-picker-list">
              {filtered.length === 0 && (
                <div className="muted" style={{ padding: "10px 12px", fontSize: 12 }}>
                  {options.length === 0 ? "No PFI created yet." : "No PFI matches that number."}
                </div>
              )}
              {filtered.map((opt) => (
                <label key={opt.pfiId} className="pfi-picker-option">
                  <input
                    type="checkbox"
                    checked={selected.some((r) => r.pfiId === opt.pfiId)}
                    onChange={() => onToggle(opt)}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}

/* ---------------- Products table (shared by PFI and PO) ---------------- */
/* variant: "pfi-sale" | "pfi-buyer" | "po" */

function DescriptionCell({ p, editable, onField }) {
  if (!editable) {
    return (
      <div className="desc-cell">
        {p.ean ? <div><span className="desc-key">EAN:</span> {p.ean}</div> : null}
        {p.caseBarcode ? <div><span className="desc-key">Case Barcode:</span> {p.caseBarcode}</div> : null}
        {p.caseSize ? <div><span className="desc-key">Pack:</span> {p.caseSize}</div> : null}
        {p.bbd ? <div><span className="desc-key">BBD:</span> {p.bbd}</div> : null}
        {!p.ean && !p.caseBarcode && !p.caseSize && !p.bbd ? <span className="muted">—</span> : null}
      </div>
    );
  }
  return (
    <div className="desc-cell">
      <div className="desc-row"><span className="desc-key">EAN</span><input value={p.ean} onChange={(e) => onField(p.id, "ean", e.target.value)} /></div>
      <div className="desc-row"><span className="desc-key">Case</span><input value={p.caseBarcode} onChange={(e) => onField(p.id, "caseBarcode", e.target.value)} /></div>
      <div className="desc-row"><span className="desc-key">Pack</span><input value={p.caseSize} onChange={(e) => onField(p.id, "caseSize", e.target.value)} /></div>
      <div className="desc-row"><span className="desc-key">BBD</span><input placeholder="02/2027" value={p.bbd || ""} onChange={(e) => onField(p.id, "bbd", e.target.value)} /></div>
    </div>
  );
}

function ProductsTable({
  pfi, variant, onSaleField, onBuyerField, onAddProduct, onAddBulk, onToggleReorder, onDeleteProduct,
  onReceiptField, onAllocationField, allPfiOptions = [], onLinkPfiToggle, highlightProductId,
  reorderKeys = new Set(), onAttachReceipt,
}) {
  const fileRef = useRef(null);
  const docRef = useRef(null);
  const rowRefs = useRef({});
  const [row, setRow] = useState({ product: "", ean: "", caseBarcode: "", caseSize: "", vat: VAT_OPTIONS[0], quantity: "", rate: "" });
  const [importState, setImportState] = useState({ status: "idle", message: "" });
  const [query, setQuery] = useState("");
  const [hit, setHit] = useState(null);
  const [zoom, setZoom] = useState("md");

  const canEditSale = variant === "pfi-sale" || variant === "po";
  const canEditBuyer = variant === "pfi-buyer" || variant === "po";
  const isPo = variant === "po";
  const canDelete = variant === "pfi-sale" || variant === "po";

  const jumpTo = (productId) => {
    const el = rowRefs.current[productId];
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHit(productId);
    setQuery("");
  };

  React.useEffect(() => {
    if (highlightProductId && rowRefs.current[highlightProductId]) {
      rowRefs.current[highlightProductId].scrollIntoView({ block: "center" });
      setHit(highlightProductId);
    }
  }, [highlightProductId]);

  const q = query.trim().toLowerCase();
  const matches = q
    ? pfi.products.filter((p) => [p.product, p.ean, p.caseBarcode].some((f) => String(f || "").toLowerCase().includes(q))).slice(0, 8)
    : [];

  const submitRow = () => {
    if (!row.product.trim()) return;
    onAddProduct(row);
    setRow({ product: "", ean: "", caseBarcode: "", caseSize: "", vat: VAT_OPTIONS[0], quantity: "", rate: "" });
  };

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["Product", "EAN", "Case Barcode", "Pack", "VAT", "Quantity", "Rate"],
      ["Yogi Tea Organic Bags Classic Chai 37.4g", "4012824406711", "4012824436718", "6 x 17s", "0.0% Z", 20, 9.02],
      ["McVities Family Circle 400g", "5000168014920", "05000168014913", "10 x 400g", "0.0% Z", 50, 20.63],
    ]);
    ws["!cols"] = [{ wch: 42 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 9 }, { wch: 9 }, { wch: 9 }];
    XLSX.utils.book_append_sheet(wb, ws, "Products");
    XLSX.writeFile(wb, "product_template.xlsx");
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        const mapped = rows.map((r) => ({
          product: String(r.Product ?? r.product ?? ""),
          ean: String(r.EAN ?? r.ean ?? ""),
          caseBarcode: String(r["Case Barcode"] ?? r["Case barcode"] ?? r.caseBarcode ?? ""),
          caseSize: String(r.Pack ?? r["Case Size"] ?? r.caseSize ?? ""),
          vat: String(r.VAT ?? r.vat ?? VAT_OPTIONS[0]),
          quantity: r.Quantity ?? r.QTY ?? r.quantity ?? "",
          rate: r.Rate ?? r.rate ?? "",
        })).filter((r) => r.product);
        if (mapped.length) onAddBulk(mapped);
        else alert("No product rows found. Use the template headers: Product, EAN, Case Barcode, Pack, VAT, Quantity, Rate.");
      } catch (err) {
        console.error(err);
        alert("Could not read this Excel file. Please use the provided template.");
      }
      e.target.value = "";
    };
    reader.readAsArrayBuffer(file);
  };

  const readAsBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });

  const handleDocument = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setImportState({ status: "busy", message: `Reading ${file.name}…` });
    try {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      const prep = isPdf ? await extractPdfForImport(file) : { images: [await imageToDataUrl(file)] };
      let parsed = null;
      let warnings = [];
      let textError = null;
      if (prep.text) {
        try {
          const res = await api.parseDocument({ text: prep.text, fileName: file.name });
          parsed = res.parsed;
          warnings = res.warnings || [];
        } catch (err) {
          textError = err; // fall through to the page-image path below
        }
      }
      if (!parsed || !(parsed.lines || []).length) {
        // No usable lines from the text layer (or a scan): read the pages as images, one request each.
        const images = prep.images || (prep.renderPages ? await prep.renderPages() : []);
        const merged = { documentNumber: "", party: "", incoterm: "", currency: "", lines: [] };
        const pageErrors = [];
        warnings = [];
        for (let i = 0; i < images.length; i++) {
          setImportState({ status: "busy", message: `Reading ${file.name}… page ${i + 1} of ${images.length}` });
          try {
            const res = await api.parseDocument({ images: [images[i]], fileName: file.name, page: i + 1, pageCount: images.length });
            for (const k of ["documentNumber", "party", "incoterm", "currency"]) if (!merged[k] && res.parsed[k]) merged[k] = res.parsed[k];
            merged.lines.push(...(res.parsed.lines || []));
            warnings.push(...(res.warnings || []).filter((w) => /check digit/.test(w)));
          } catch (err) {
            pageErrors.push(`page ${i + 1}: ${err && err.message ? err.message : err}`);
          }
        }
        if (!merged.lines.length && (pageErrors.length || textError)) {
          throw new Error([textError && textError.message, ...pageErrors].filter(Boolean).join("; "));
        }
        parsed = merged;
        if (prep.pageCount > images.length) warnings.push(`Only the first ${images.length} of ${prep.pageCount} pages were read`);
      }
      const lines = (parsed.lines || []).map((l) => ({
        product: String(l.product || "").trim(),
        ean: String(l.ean || "").trim(),
        caseBarcode: String(l.caseBarcode || "").trim(),
        caseSize: String(l.pack || "").trim(),
        bbd: String(l.bbd || "").trim(),
        vat: String(l.vat || VAT_OPTIONS[0]).trim(),
        quantity: l.quantity ?? "",
        rate: l.rate ?? "",
      })).filter((l) => l.product);

      if (lines.length === 0) {
        setImportState({ status: "err", message: "No product lines were found in that document." });
        return;
      }
      onAddBulk(lines);
      const head = [parsed.documentNumber && `No. ${parsed.documentNumber}`, parsed.party, parsed.incoterm, parsed.currency]
        .filter(Boolean).join(" · ");
      const barcodeWarnings = warnings.filter((w) => /check digit/.test(w)).length;
      const pagesNote = warnings.find((w) => /pages were read/.test(w));
      const verify = (barcodeWarnings ? ` ${barcodeWarnings} barcode(s) failed their check digit — please verify them.` : "") + (pagesNote ? ` ${pagesNote}.` : "");
      setImportState({ status: "ok", message: `Imported ${lines.length} line(s)${head ? ` — ${head}` : ""}. Check the currency and terms on this order match the document.${verify}` });
    } catch (err) {
      console.error(err);
      const reason = err && err.message && !/failed to fetch/i.test(err.message) ? ` (${String(err.message).slice(0, 140)})` : "";
      const quota = /allowance|quota|neuron/i.test(String(err && err.message));
      setImportState({ status: "err", message: `Could not read that document${reason}. ${quota ? "" : "Try a clearer PDF, use the Excel template, or "}${quota ? "No daily limit the other way: " : ""}let Claude or ChatGPT read it and add the lines — open the AI agent link tab.`, agentHint: true });
    }
  };

  const optionFor = (pfiId) => allPfiOptions.find((o) => o.pfiId === pfiId);
  const colCount = 15;

  return (
    <div className="section-card">
      <div className="section-title">
        <span>Products <span className="muted" style={{ fontWeight: 400 }}>({pfi.products.length} line{pfi.products.length === 1 ? "" : "s"})</span></span>
        {canEditSale && (
          <div className="actions">
            <button className="btn btn-sm btn-accent" disabled={importState.status === "busy"} onClick={() => docRef.current && docRef.current.click()}>
              <FileText size={12} /> {importState.status === "busy" ? "Reading…" : "Import PDF"}
            </button>
            <input ref={docRef} type="file" accept=".pdf,image/*" style={{ display: "none" }} onChange={handleDocument} />
            <button className="btn btn-sm" onClick={() => fileRef.current && fileRef.current.click()}><Upload size={12} /> Import Excel</button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={handleFile} />
            <button className="btn btn-sm" onClick={downloadTemplate}><Download size={12} /> Template</button>
          </div>
        )}
      </div>

      {importState.status !== "idle" && (
        <div className={`import-note ${importState.status === "ok" ? "ok" : importState.status === "err" ? "err" : "busy"}`} style={{ marginBottom: 8 }}>
          {importState.message}
          {importState.agentHint && <> <a href="#agent" target="_blank" rel="noreferrer" className="import-agent-link">Open AI agent link ↗</a></>}
        </div>
      )}

      <div className="table-toolbar">
        <div className="search-wrap">
          <Search size={13} className="search-icon" />
          <input
            className="search-input"
            placeholder="Find by product, EAN or case barcode…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {q && (
            <div className="search-panel">
              {matches.length === 0 && <div className="muted" style={{ padding: "8px 10px", fontSize: 12 }}>No match in this order.</div>}
              {matches.map((m) => (
                <div key={m.id} className="search-option" onClick={() => jumpTo(m.id)}>
                  <div style={{ fontWeight: 600 }}>{m.product}</div>
                  <div className="muted" style={{ fontSize: 11 }}>
                    {m.ean ? `EAN ${m.ean}` : ""}{m.ean && m.caseBarcode ? " · " : ""}{m.caseBarcode ? `Case ${m.caseBarcode}` : ""} · Qty {m.quantity || "—"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="zoom-group">
          <span className="pay-stat-label" style={{ marginBottom: 0 }}>Zoom</span>
          {[["sm", "S"], ["md", "M"], ["lg", "L"]].map(([key, label]) => (
            <button key={key} className={`zoom-btn ${zoom === key ? "on" : ""}`} onClick={() => setZoom(key)}>{label}</button>
          ))}
        </div>
      </div>

      <div className="muted" style={{ marginBottom: 8 }}>
        {isPo
          ? "Link a line to one or more PFIs, then run each PFI row on its own — cases allocated, status, dates and what actually arrived."
          : "Each PO covering a line appears as its own row underneath it, with the cases allocated to this PFI."}
      </div>

      <div className={`table-scroll zoom-${zoom}`}>
        <table className="data-table sticky-first">
          <thead>
            <tr>
              <th style={{ minWidth: 200 }}>Product</th>
              <th style={{ minWidth: 200 }}>Description</th>
              <th>VAT</th>
              <th>Qty</th>
              <th>Rate</th>
              <th>Amount</th>
              <th style={{ minWidth: 150 }}>{isPo ? "PFI" : "PO No."}</th>
              <th style={{ borderLeft: "2px solid #BFE3CB" }}>Order status</th>
              <th>Est. delivery</th>
              <th>Received qty</th>
              <th>Received date</th>
              <th>BBD received</th>
              <th>Short / Surplus</th>
              <th>Reorder</th>
              {canDelete && <th />}
            </tr>
          </thead>
          <tbody>
            {pfi.products.length === 0 && (
              <tr><td colSpan={colCount} className="ro muted" style={{ padding: 16 }}>No product lines yet.</td></tr>
            )}
            {pfi.products.map((p) => {
              const receipts = isPo ? [] : (p.receipts || []);
              const allocations = isPo ? (p.linkedPfiRefs || []) : [];
              const hasReceipts = receipts.length > 0;
              const hasAllocations = allocations.length > 0;
              const rolledUp = hasReceipts || hasAllocations;

              const sumReceived = (arr, key) => arr.reduce((acc, r) => {
                const v = numOrNull(r[key]);
                return v === null ? acc : (acc === null ? v : acc + v);
              }, null);

              const totalReceived = hasReceipts
                ? sumReceived(receipts, "receivedQuantity")
                : hasAllocations ? sumReceived(allocations, "receivedQty") : numOrNull(p.receivedQuantity);

              const diff = totalReceived === null ? null : totalReceived - Number(p.quantity || 0);
              const short = diff !== null && diff < 0 ? Math.abs(diff) : 0;
              const surplus = diff !== null && diff > 0 ? diff : 0;

              const statusSource = hasReceipts
                ? receipts
                : hasAllocations ? allocations.map((a) => ({ orderStatus: a.orderStatus || p.orderStatus })) : [];
              const rollLabel = rolledUp ? rollupStatusLabel(statusSource) : null;

              return (
                <React.Fragment key={p.id}>
                  <tr
                    ref={(el) => { rowRefs.current[p.id] = el; }}
                    className={`${rolledUp ? "parent-row" : ""} ${hit === p.id ? "row-hit" : ""}`}
                  >
                    <td>{canEditSale ? <input value={p.product} onChange={(e) => onSaleField(p.id, "product", e.target.value)} /> : <span className="ro">{p.product}</span>}</td>
                    <td><DescriptionCell p={p} editable={canEditSale} onField={onSaleField} /></td>
                    <td>
                      {canEditSale ? (
                        <select value={p.vat || VAT_OPTIONS[0]} onChange={(e) => onSaleField(p.id, "vat", e.target.value)}>
                          {VAT_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                      ) : <span className="ro">{p.vat || VAT_OPTIONS[0]}</span>}
                    </td>
                    <td>{canEditSale ? <input type="number" value={p.quantity} onChange={(e) => onSaleField(p.id, "quantity", e.target.value)} /> : <span className="ro">{p.quantity}</span>}</td>
                    <td>{canEditSale ? <input type="number" value={p.rate} onChange={(e) => onSaleField(p.id, "rate", e.target.value)} /> : <span className="ro">{p.rate}</span>}</td>
                    <td><span className="ro sm-mono">{formatMoney(p.amount, pfi.currency)}</span></td>

                    <td>
                      {isPo ? (
                        <div>
                          <PfiLinkPicker options={allPfiOptions} selected={allocations} onToggle={(opt) => onLinkPfiToggle(p.id, opt)} />
                          {hasAllocations && (
                            <div className="alloc-note">Allocated {sumAllocated(allocations, "allocatedQty")} / {p.quantity || 0}</div>
                          )}
                        </div>
                      ) : (
                        hasReceipts
                          ? <span className="ro po-no-cell">{receipts.length === 1 ? receiptPoLabel(receipts[0]) : `${receipts.length} POs`}</span>
                          : <span className="ro muted">—</span>
                      )}
                    </td>

                    <td style={{ borderLeft: "2px solid #BFE3CB" }}>
                      {rolledUp
                        ? <span className={`ro tone-${ROLLUP_TONE[rollLabel] || "grey"}`}>{rollLabel}</span>
                        : canEditBuyer
                          ? (
                            <select className={`tone-${ORDER_STATUS_TONE[p.orderStatus] || "grey"}`} value={p.orderStatus} onChange={(e) => onBuyerField(p.id, "orderStatus", e.target.value)}>
                              {ORDER_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                          )
                          : <span className={`ro tone-${ORDER_STATUS_TONE[p.orderStatus] || "grey"}`}>{ORDER_STATUS_LABEL[p.orderStatus] || "—"}</span>}
                    </td>
                    <td>
                      {rolledUp
                        ? <span className="ro muted">{isPo ? "per PFI below" : "per PO below"}</span>
                        : canEditBuyer
                          ? <DateField value={p.estimatedDeliveryDate} onChange={(v) => onBuyerField(p.id, "estimatedDeliveryDate", v)} />
                          : <span className="ro">{fmtDate(p.estimatedDeliveryDate) || "—"}</span>}
                    </td>
                    <td>
                      {rolledUp
                        ? <span className="ro" style={{ fontWeight: 700 }}>{totalReceived === null ? "—" : totalReceived}</span>
                        : canEditBuyer
                          ? <input type="number" value={p.receivedQuantity} onChange={(e) => onBuyerField(p.id, "receivedQuantity", e.target.value)} />
                          : <span className="ro">{p.receivedQuantity || "—"}</span>}
                    </td>
                    <td>
                      {rolledUp
                        ? <span className="ro muted">{isPo ? "per PFI below" : "per PO below"}</span>
                        : canEditBuyer
                          ? <DateField value={p.receivedDate || ""} onChange={(v) => onBuyerField(p.id, "receivedDate", v)} />
                          : <span className="ro">{fmtDate(p.receivedDate) || "—"}</span>}
                    </td>
                    <td>
                      {rolledUp
                        ? <span className="ro muted">{isPo ? "per PFI below" : "per PO below"}</span>
                        : canEditBuyer
                          ? <DateField value={p.bbdReceived} onChange={(v) => onBuyerField(p.id, "bbdReceived", v)} />
                          : <span className="ro">{fmtDate(p.bbdReceived) || "—"}</span>}
                    </td>
                    <td>
                      {totalReceived === null ? <span className="ro muted">—</span>
                        : short > 0 ? <span className="ro tone-red">Short {short}</span>
                          : surplus > 0 ? <span className="ro tone-green">Surplus {surplus}</span>
                            : <span className="ro tone-green">Complete</span>}
                    </td>
                    <td>
                      {(() => {
                        if (isPo || hasReceipts) return <span className="ro muted">{hasReceipts ? "per PO below" : "—"}</span>;
                        const key = `${p.id}::manual`;
                        const on = reorderKeys.has(key);
                        if (canEditSale && (short > 0 || on)) {
                          return (
                            <button className={`reorder-btn ${on ? "active" : ""}`} onClick={() => onToggleReorder(p.id, null, short)}>
                              <RotateCcw size={11} /> {on ? "Reordered" : `Reorder ${short}`}
                            </button>
                          );
                        }
                        return on ? <span className="chip amber">Reordered</span> : <span className="ro muted">—</span>;
                      })()}
                    </td>
                    {canDelete && (
                      <td><button className="btn-icon" title="Remove product line" onClick={() => onDeleteProduct(p.id)}><Trash2 size={14} /></button></td>
                    )}
                  </tr>

                  {/* PFI view: one row per PO covering this line */}
                  {receipts.map((r) => {
                    const rq = numOrNull(r.receivedQuantity);
                    const rdiff = rq === null ? null : rq - Number(r.quantity || 0);
                    return (
                      <tr key={`${r.poLineId}-${r.pfiId}`} className={`sub-row ${hit === p.id ? "row-hit" : ""}`}>
                        <td className="ro"><span className="sub-arrow">↳</span> <strong>{receiptPoLabel(r)}</strong></td>
                        <td />
                        <td />
                        <td className="ro">{r.quantity || "—"}</td>
                        <td />
                        <td />
                        <td><span className="ro po-no-cell">{receiptPoLabel(r)}</span></td>
                        <td style={{ borderLeft: "2px solid #BFE3CB" }}>
                          {canEditBuyer
                            ? (
                              <select className={`tone-${ORDER_STATUS_TONE[r.orderStatus] || "grey"}`} value={r.orderStatus || "not_ordered"} onChange={(e) => onReceiptField(r, "orderStatus", e.target.value)}>
                                {ORDER_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                              </select>
                            )
                            : <span className={`ro tone-${ORDER_STATUS_TONE[r.orderStatus] || "grey"}`}>{ORDER_STATUS_LABEL[r.orderStatus] || "—"}</span>}
                        </td>
                        <td>{canEditBuyer ? <DateField value={r.estimatedDeliveryDate || ""} onChange={(v) => onReceiptField(r, "estimatedDeliveryDate", v)} /> : <span className="ro">{fmtDate(r.estimatedDeliveryDate) || "—"}</span>}</td>
                        <td>{canEditBuyer ? <input type="number" value={r.receivedQuantity ?? ""} onChange={(e) => onReceiptField(r, "receivedQuantity", e.target.value)} /> : <span className="ro">{r.receivedQuantity || "—"}</span>}</td>
                        <td>{canEditBuyer ? <DateField value={r.receivedDate || ""} onChange={(v) => onReceiptField(r, "receivedDate", v)} /> : <span className="ro">{fmtDate(r.receivedDate) || "—"}</span>}</td>
                        <td>{canEditBuyer ? <DateField value={r.bbdReceived || ""} onChange={(v) => onReceiptField(r, "bbdReceived", v)} /> : <span className="ro">{fmtDate(r.bbdReceived) || "—"}</span>}</td>
                        <td>
                          {rdiff === null ? <span className="ro muted">—</span>
                            : rdiff < 0 ? <span className="ro tone-red">Short {Math.abs(rdiff)}</span>
                              : rdiff > 0 ? <span className="ro tone-green">Surplus {rdiff}</span>
                                : <span className="ro tone-green">Complete</span>}
                        </td>
                        <td>
                          {(() => {
                            const rshort = rdiff !== null && rdiff < 0 ? Math.abs(rdiff) : 0;
                            const key = `${p.id}::${r.poLineId}`;
                            const on = reorderKeys.has(key);
                            if (canEditSale && (rshort > 0 || on)) {
                              return (
                                <button className={`reorder-btn ${on ? "active" : ""}`} onClick={() => onToggleReorder(p.id, r, rshort)}>
                                  <RotateCcw size={11} /> {on ? "Reordered" : `Reorder ${rshort}`}
                                </button>
                              );
                            }
                            return on ? <span className="chip amber">Reordered</span> : <span className="ro muted">—</span>;
                          })()}
                        </td>
                        {canDelete && <td />}
                      </tr>
                    );
                  })}

                  {/* PO view: one row per PFI this line is split across */}
                  {allocations.map((a) => {
                    const alloc = numOrNull(a.allocatedQty);
                    const got = numOrNull(a.receivedQty);
                    const adiff = got === null || alloc === null ? null : got - alloc;
                    const opt = optionFor(a.pfiId);
                    const st = a.orderStatus || p.orderStatus || "not_ordered";
                    return (
                      <tr key={`${p.id}-${a.pfiId}`} className={`sub-row ${hit === p.id ? "row-hit" : ""}`}>
                        <td className="ro"><span className="sub-arrow">↳</span> <strong>{opt ? opt.shortLabel : "PFI"}</strong></td>
                        <td>
                          <div className="ro muted" style={{ fontSize: 11 }}>{opt ? opt.customerName : ""}</div>
                          {opt && (
                            <select
                              className="line-pick"
                              title="The line on that PFI this PO row covers"
                              style={{ marginTop: 4 }}
                              value={a.pfiProductId != null ? a.pfiProductId : (matchPfiLine(opt.lines || [], null, p) || "")}
                              onChange={(e) => onAllocationField(p.id, a.pfiId, "pfiProductId", e.target.value)}
                            >
                              <option value="">— no PFI line matched —</option>
                              {(opt.lines || []).map((l) => <option key={l.id} value={l.id}>{l.product}{l.ean ? ` · ${l.ean}` : ""}</option>)}
                            </select>
                          )}
                        </td>
                        <td />
                        <td><input type="number" placeholder="cases" value={a.allocatedQty ?? ""} onChange={(e) => onAllocationField(p.id, a.pfiId, "allocatedQty", e.target.value)} /></td>
                        <td />
                        <td />
                        <td><span className="ro po-no-cell">{opt ? opt.shortLabel : "—"}</span></td>
                        <td style={{ borderLeft: "2px solid #BFE3CB" }}>
                          <select className={`tone-${ORDER_STATUS_TONE[st] || "grey"}`} value={st} onChange={(e) => onAllocationField(p.id, a.pfiId, "orderStatus", e.target.value)}>
                            {ORDER_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                          </select>
                        </td>
                        <td><DateField value={a.estimatedDeliveryDate || ""} onChange={(v) => onAllocationField(p.id, a.pfiId, "estimatedDeliveryDate", v)} /></td>
                        <td><input type="number" placeholder="received" value={a.receivedQty ?? ""} onChange={(e) => onAllocationField(p.id, a.pfiId, "receivedQty", e.target.value)} /></td>
                        <td><DateField value={a.receivedDate || ""} onChange={(v) => onAllocationField(p.id, a.pfiId, "receivedDate", v)} /></td>
                        <td><DateField value={a.bbdReceived || ""} onChange={(v) => onAllocationField(p.id, a.pfiId, "bbdReceived", v)} /></td>
                        <td>
                          {adiff === null ? <span className="ro muted">—</span>
                            : adiff < 0 ? <span className="ro tone-red">Short {Math.abs(adiff)}</span>
                              : adiff > 0 ? <span className="ro tone-green">Surplus {adiff}</span>
                                : <span className="ro tone-green">Complete</span>}
                        </td>
                        <td />
                        {canDelete && (
                          <td><button className="btn-icon" title="Unlink this PFI" onClick={() => onLinkPfiToggle(p.id, { pfiId: a.pfiId, saleId: a.saleId })}><Trash2 size={13} /></button></td>
                        )}
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {!isPo && (pfi.unmatchedReceipts || []).length > 0 && (
        <div className="unmatched-block">
          <div className="section-title" style={{ marginTop: 12 }}>
            <span>Unmatched PO rows <span className="muted" style={{ fontWeight: 400 }}>({pfi.unmatchedReceipts.length})</span></span>
            <span className="muted" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
              These PO rows point at this PFI but match none of its lines. Pick the line each one covers, then save.
            </span>
          </div>
          <div className="table-scroll">
            <table className="data-table" style={{ minWidth: "auto" }}>
              <thead><tr><th>PO</th><th>Product on the PO</th><th>Cases</th><th>Order status</th><th>Received qty</th><th style={{ minWidth: 220 }}>Attach to line</th></tr></thead>
              <tbody>
                {pfi.unmatchedReceipts.map((r) => (
                  <tr key={`${r.poLineId}-${r.pfiId}`}>
                    <td className="ro"><strong>{receiptPoLabel(r)}</strong></td>
                    <td className="ro">{r.poProduct}{r.poEan ? <div className="muted" style={{ fontSize: 11 }}>EAN {r.poEan}</div> : null}</td>
                    <td className="ro">{r.quantity || "—"}</td>
                    <td><span className={`ro tone-${ORDER_STATUS_TONE[r.orderStatus] || "grey"}`}>{ORDER_STATUS_LABEL[r.orderStatus] || "—"}</span></td>
                    <td className="ro">{r.receivedQuantity || "—"}</td>
                    <td>
                      <select value="" onChange={(e) => e.target.value && onAttachReceipt && onAttachReceipt(r, e.target.value)}>
                        <option value="">Choose a line…</option>
                        {pfi.products.map((p) => <option key={p.id} value={p.id}>{p.product}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {canEditSale && (
        <div className="mini-form-row">
          <div className="mini-field"><label>Product</label><input value={row.product} onChange={(e) => setRow({ ...row, product: e.target.value })} style={{ width: 190 }} /></div>
          <div className="mini-field"><label>EAN</label><input value={row.ean} onChange={(e) => setRow({ ...row, ean: e.target.value })} style={{ width: 120 }} /></div>
          <div className="mini-field"><label>Case barcode</label><input value={row.caseBarcode} onChange={(e) => setRow({ ...row, caseBarcode: e.target.value })} style={{ width: 120 }} /></div>
          <div className="mini-field"><label>Pack</label><input placeholder="6 x 17s" value={row.caseSize} onChange={(e) => setRow({ ...row, caseSize: e.target.value })} style={{ width: 100 }} /></div>
          <div className="mini-field">
            <label>VAT</label>
            <select value={row.vat} onChange={(e) => setRow({ ...row, vat: e.target.value })}>
              {VAT_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="mini-field"><label>Qty</label><input type="number" value={row.quantity} onChange={(e) => setRow({ ...row, quantity: e.target.value })} style={{ width: 70 }} /></div>
          <div className="mini-field"><label>Rate</label><input type="number" value={row.rate} onChange={(e) => setRow({ ...row, rate: e.target.value })} style={{ width: 70 }} /></div>
          <button className="btn btn-accent btn-sm" onClick={submitRow}><Plus size={12} /> Add row</button>
        </div>
      )}
    </div>
  );
}

function PoDeliverySection({ delivery, onChange }) {
  return (
    <div className="section-card">
      <div className="section-title"><span>Delivery from supplier</span></div>
      <div className="mini-form-row" style={{ marginTop: 0 }}>
        <div className="mini-field">
          <label>Type</label>
          <select value={delivery.type} onChange={(e) => onChange({ type: e.target.value })}>
            {PO_DELIVERY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="mini-field">
          <label>Vehicle</label>
          <select value={delivery.vehicleType} onChange={(e) => onChange({ vehicleType: e.target.value })}>
            {PO_VEHICLE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="mini-field">
          <label>Sub-type</label>
          <select value={delivery.subType} onChange={(e) => onChange({ subType: e.target.value })}>
            {PO_SUBTYPES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="mini-field"><label>Loading date</label><DateField value={delivery.loadingDate} onChange={(v) => onChange({ loadingDate: v })} /></div>
        <div className="mini-field"><label>Loading time</label><input type="time" value={delivery.loadingTime} onChange={(e) => onChange({ loadingTime: e.target.value })} /></div>
        <div className="mini-field"><label>ETD</label><DateField value={delivery.etd} onChange={(v) => onChange({ etd: v })} /></div>
        <div className="mini-field"><label>ETA</label><DateField value={delivery.eta} onChange={(v) => onChange({ eta: v })} /></div>
      </div>
    </div>
  );
}

/* PFI delivery: Sale and Buyer both edit every field; each change notifies the other side. */

function PfiDeliverySection({ delivery, role, onChange }) {
  const subtypes = VEHICLE_SUBTYPES[delivery.vehicleType] || [];
  const isDelivery = delivery.type === "delivery";
  const other = role === "sale" ? "Buyer" : "Sale";

  return (
    <div className="section-card">
      <div className="section-title">
        <span>Delivery</span>
        <span className="muted" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
          Shared with {other} — whatever you save here shows up on their screen too.
        </span>
      </div>

      <div className="mini-form-row">
        <div className="mini-field">
          <label>Type</label>
          <select value={delivery.type} onChange={(e) => onChange({ type: e.target.value })} style={{ maxWidth: 220 }}>
            {PFI_DELIVERY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="mini-field">
          <label>Loaded or not</label>
          <select className={delivery.loaded === "loaded" ? "tone-green" : "tone-grey"} value={delivery.loaded || "not_loaded"} onChange={(e) => onChange({ loaded: e.target.value })}>
            <option value="not_loaded">Not loaded</option>
            <option value="loaded">Loaded</option>
          </select>
        </div>
      </div>

      {isDelivery ? (
        <>
          <div className="delivery-block">
            <div className="delivery-block-label">Booking &amp; loading</div>
            <div className="mini-form-row">
              <div className="mini-field">
                <label>Booking status</label>
                <select value={delivery.bookedStatus || "not_booked"} onChange={(e) => onChange({ bookedStatus: e.target.value })}>
                  <option value="not_booked">Not booked</option>
                  <option value="booked">Booked</option>
                </select>
              </div>
              <div className="mini-field">
                <label>Booked by</label>
                <select value={delivery.bookedBy || ""} onChange={(e) => onChange({ bookedBy: e.target.value })}>
                  <option value="">—</option>
                  <option value="sale">Sale</option>
                  <option value="buyer">Buyer</option>
                </select>
              </div>
              <div className="mini-field">
                <label>Vehicle</label>
                <select value={delivery.vehicleType} onChange={(e) => onChange({ vehicleType: e.target.value, subType: VEHICLE_SUBTYPES[e.target.value][0] })}>
                  {VEHICLE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="mini-field">
                <label>Sub-type</label>
                <select value={delivery.subType} onChange={(e) => onChange({ subType: e.target.value })}>
                  {subtypes.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="mini-field"><label>Loading date</label><DateField value={delivery.loadingDate} onChange={(v) => onChange({ loadingDate: v })} /></div>
              <div className="mini-field"><label>Loading time</label><input type="time" value={delivery.loadingTime} onChange={(e) => onChange({ loadingTime: e.target.value })} /></div>
            </div>
          </div>

          <div className="delivery-block">
            <div className="delivery-block-label">Schedule</div>
            <div className="mini-form-row">
              <div className="mini-field"><label>ETD</label><DateField value={delivery.etd} onChange={(v) => onChange({ etd: v })} /></div>
              <div className="mini-field"><label>ETA</label><DateField value={delivery.eta} onChange={(v) => onChange({ eta: v })} /></div>
            </div>
          </div>
        </>
      ) : (
        <div className="delivery-block">
          <div className="delivery-block-label">Customer collection</div>
          <div className="mini-form-row">
            <div className="mini-field"><label>Collection date</label><DateField value={delivery.collectionDate} onChange={(v) => onChange({ collectionDate: v })} /></div>
            <div className="mini-field"><label>Collection time</label><input type="time" value={delivery.collectionTime} onChange={(e) => onChange({ collectionTime: e.target.value })} /></div>
            <div className="muted" style={{ paddingBottom: 8 }}>Tell the warehouse when the customer arrives.</div>
          </div>
        </div>
      )}
    </div>
  );
}

function DocumentsSection({ documents, canAdd, canEditStatus, onAdd, onStatusChange }) {
  const [type, setType] = useState(DOC_TYPES[0]);
  const [content, setContent] = useState("");
  const [fileMeta, setFileMeta] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await api.uploadFile(file);
      setFileMeta({ name: res.fileName, url: res.url });
    } catch (err) {
      console.error(err);
      alert("Could not upload that file. Please try again.");
      setFileMeta(null);
      if (fileRef.current) fileRef.current.value = "";
    } finally {
      setUploading(false);
    }
  };

  const submit = () => {
    if (!content.trim() && !fileMeta) return;
    onAdd({ id: uid("doc"), type, content: content.trim(), fileName: fileMeta?.name || "", fileUrl: fileMeta?.url || "", status: "not_applied" });
    setContent("");
    setFileMeta(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="section-card">
      <div className="section-title"><span>Documents</span></div>
      {documents.length === 0 && <div className="muted" style={{ marginBottom: 10 }}>No documents yet.</div>}
      {documents.map((d) => (
        <div key={d.id} className="doc-card">
          <div style={{ flex: 1 }}>
            <span className="doc-type-badge">{d.type}</span>
            {d.content && <div className="doc-content">{d.content}</div>}
            {d.fileName && (
              <a className="doc-file-link" href={d.fileUrl} download={d.fileName} target="_blank" rel="noreferrer">
                <Paperclip size={12} /> {d.fileName}
              </a>
            )}
            <div className="doc-status-row">
              {canEditStatus ? (
                <select className={`tone-${DOC_STATUS_TONE[d.status || "not_applied"]}`} value={d.status || "not_applied"} onChange={(e) => onStatusChange(d.id, e.target.value)}>
                  {DOC_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              ) : (
                <span className={`ro tone-${DOC_STATUS_TONE[d.status || "not_applied"]}`}>{DOC_STATUS_LABEL[d.status || "not_applied"]}</span>
              )}
            </div>
          </div>
        </div>
      ))}

      {canAdd && (
        <div className="mini-form-row" style={{ alignItems: "flex-start" }}>
          <div className="mini-field">
            <label>Document type</label>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="mini-field" style={{ flex: 1, minWidth: 200 }}>
            <label>Content</label>
            <textarea rows={1} value={content} onChange={(e) => setContent(e.target.value)} />
          </div>
          {(type === "INV" || type === "PL") && (
            <div className="mini-field">
              <label>Attach file</label>
              <input ref={fileRef} type="file" onChange={handleFile} />
            </div>
          )}
          <button className="btn btn-accent btn-sm" disabled={uploading} onClick={submit}><Plus size={12} /> Add</button>
        </div>
      )}
    </div>
  );
}

function PaymentSection({ pfi, canEdit, onAddPayment }) {
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const total = productTotal(pfi.products);
  const paid = paymentTotal(pfi.payments);
  const remaining = Math.max(total - paid, 0);
  const status = paymentStatus(total, paid);

  const submit = () => {
    const amt = parseFloat(amount);
    if (!date || !amt) return;
    onAddPayment({ id: uid("pay"), date, amount: amt });
    setDate("");
    setAmount("");
  };

  return (
    <div className="section-card">
      <div className="section-title">
        <span>Payment</span>
        <span className={`chip ${status}`}>{paymentStatusLabel(status)}</span>
      </div>
      <div className="pay-summary">
        <div><div className="pay-stat-label">Order total</div><div className="pay-stat-value">{formatMoney(total, pfi.currency)}</div></div>
        <div><div className="pay-stat-label">Paid</div><div className="pay-stat-value">{formatMoney(paid, pfi.currency)}</div></div>
        <div><div className="pay-stat-label">Remaining</div><div className="pay-stat-value">{formatMoney(remaining, pfi.currency)}</div></div>
      </div>

      {pfi.payments.length > 0 && (
        <div className="table-scroll" style={{ marginBottom: 10 }}>
          <table className="data-table" style={{ minWidth: "auto" }}>
            <thead><tr><th>Date</th><th>Amount</th></tr></thead>
            <tbody>
              {pfi.payments.map((p) => (
                <tr key={p.id}><td className="ro">{fmtDate(p.date)}</td><td className="ro sm-mono">{formatMoney(p.amount, pfi.currency)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        <div className="mini-form-row">
          <div className="mini-field"><label>Date</label><DateField value={date} onChange={(v) => setDate(v)} /></div>
          <div className="mini-field"><label>Amount</label><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 110 }} /></div>
          <button className="btn btn-accent btn-sm" onClick={submit}><CreditCard size={12} /> Record payment</button>
        </div>
      )}
    </div>
  );
}

/* ---------------- PFI (Sale side) ---------------- */

function strippedRecord(rec) {
  return JSON.stringify(stripDerived(rec));
}

function withAmount(line, field, value) {
  const updated = { ...line, [field]: value };
  if (field === "quantity" || field === "rate") {
    updated.amount = computeAmount(field === "quantity" ? value : updated.quantity, field === "rate" ? value : updated.rate);
  }
  return updated;
}

function SaveBar({ dirty, onSave, onDiscard, extra }) {
  return (
    <div className="save-bar">
      {dirty
        ? <span className="chip amber">Unsaved changes</span>
        : <span className="chip green">All changes saved</span>}
      <span className="muted" style={{ fontSize: 11.5 }}>
        {dirty ? "Nothing is sent to the other side until you save." : "Edit anything below, then save."}
      </span>
      <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
        {extra}
        <button className="btn btn-sm" disabled={!dirty} onClick={onDiscard}>Discard</button>
        <button className="btn btn-accent btn-sm" disabled={!dirty} onClick={onSave}><Save size={12} /> Save changes</button>
      </div>
    </div>
  );
}

function exportPfiWorkbook(pfi) {
  const rows = [
    ["PACKING LIST"],
    ["PFI", pfi.pfiNo || "", "Customer", pfi.customerName],
    [],
    ["EAN", "Case Barcode", "Product", "Case quantity", "BBD received"],
  ];

  pfi.products.forEach((p) => {
    const receipts = p.receipts || [];
    const bbds = receipts.length
      ? Array.from(new Set(receipts.map((r) => fmtDate(r.bbdReceived)).filter(Boolean))).join(", ")
      : fmtDate(p.bbdReceived);
    rows.push([p.ean || "", p.caseBarcode || "", p.product, Number(p.quantity || 0), bbds]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 18 }, { wch: 20 }, { wch: 46 }, { wch: 14 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Packing list");
  XLSX.writeFile(wb, `PFI_${pfi.pfiNo || "order"}_packing_list.xlsx`);
}

function FindBar({ value, onChange, placeholder, total, shown }) {
  return (
    <div className="find-bar">
      <div className="search-wrap" style={{ maxWidth: 420 }}>
        <Search size={13} className="search-icon" />
        <input className="search-input" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
      {value.trim() && (
        <span className="muted" style={{ fontSize: 12 }}>
          {shown} of {total} match{shown === 1 ? "" : "es"}
          <button className="btn btn-sm btn-ghost" style={{ marginLeft: 6 }} onClick={() => onChange("")}>Clear</button>
        </span>
      )}
    </div>
  );
}

function PfiDetail({ pfi, viewer, actions, pos, highlightProductId }) {
  const isSale = viewer === "sale";
  const [draft, setDraft] = useState(pfi);
  const [allocPatches, setAllocPatches] = useState([]);
  const [reorderToggles, setReorderToggles] = useState([]);

  const lastPfi = useRef(pfi);
  React.useEffect(() => {
    if (pfi === lastPfi.current) return;
    if (pfi.id !== lastPfi.current.id) {
      lastPfi.current = pfi;
      setDraft(pfi);
      setAllocPatches([]);
      setReorderToggles([]);
      return;
    }
    // Same PFI, new data (a poll or a save). Untouched draft → take it all; edited draft → refresh only what the POs derive.
    const wasDirty = strippedRecord(draft) !== strippedRecord(lastPfi.current) || allocPatches.length > 0 || reorderToggles.length > 0;
    lastPfi.current = pfi;
    if (!wasDirty) { setDraft(pfi); return; }
    // Fresh receipts from the POs, with this draft's unsaved receipt edits and "attach to line" moves laid back on top.
    const patchesFor = (r) => allocPatches.filter((x) => x.poLineId === r.poLineId && x.pfiId === r.pfiId);
    const placed = [
      ...pfi.products.flatMap((p) => (p.receipts || []).map((r) => ({ r, lineId: p.id }))),
      ...(pfi.unmatchedReceipts || []).map((r) => ({ r, lineId: null })),
    ].map(({ r, lineId }) => {
      const mine = patchesFor(r);
      const move = mine.find((x) => x.field === "pfiProductId");
      const edited = mine.filter((x) => x.field !== "pfiProductId")
        .reduce((acc, x) => ({ ...acc, [x.field === "receivedQty" ? "receivedQuantity" : x.field]: x.value }), r);
      return { r: move ? { ...edited, pfiProductId: move.value } : edited, lineId: move ? move.value : lineId };
    });
    setAllocPatches((prev) => prev.filter((x) => placed.some((e) => e.r.poLineId === x.poLineId && e.r.pfiId === x.pfiId))); // PO row gone remotely → nothing left to save
    setDraft((d0) => {
      const d = mergeOtherRole(d0, pfi, viewer); // the other role's fields come from the newest record; this role's edits stay
      const known = new Set(d.products.map((p) => p.id));
      const fixed = placed.map((x) => (x.lineId && !known.has(x.lineId) ? { ...x, lineId: null } : x)); // move target deleted → unmatched
      return {
        ...d,
        unmatchedReceipts: fixed.filter((x) => x.lineId === null).map((x) => x.r),
        products: d.products.map((p) => ({ ...p, receipts: fixed.filter((x) => x.lineId === p.id).map((x) => x.r) })),
      };
    });
  }, [pfi]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = strippedRecord(draft) !== strippedRecord(pfi) || allocPatches.length > 0 || reorderToggles.length > 0;

  // An unmatched PO row is attached by naming the PFI line on the PO ref (saved with the PFI).
  const attachReceipt = (r, lineId) => {
    setAllocPatches((prev) => [...prev.filter((x) => !(x.poLineId === r.poLineId && x.pfiId === r.pfiId && x.field === "pfiProductId")),
      { poId: r.poId, poLineId: r.poLineId, pfiId: r.pfiId, field: "pfiProductId", value: lineId }]);
    setDraft((d) => ({
      ...d,
      unmatchedReceipts: (d.unmatchedReceipts || []).filter((x) => !(x.poLineId === r.poLineId && x.pfiId === r.pfiId)),
      products: d.products.map((p) => (p.id === lineId ? { ...p, receipts: [...(p.receipts || []), { ...r, pfiProductId: lineId }] } : p)),
    }));
  };

  const patchProducts = (fn) => setDraft((d) => ({ ...d, products: fn(d.products) }));

  const saleField = (pid, field, value) =>
    patchProducts((list) => list.map((p) => (p.id === pid ? withAmount(p, field, value) : p)));
  const buyerField = (pid, field, value) =>
    patchProducts((list) => list.map((p) => (p.id === pid ? { ...p, [field]: value } : p)));
  const addProduct = (row) => patchProducts((list) => [...list, {
    id: uid("prod"),
    product: row.product || "", ean: row.ean || "", caseBarcode: row.caseBarcode || "",
    caseSize: row.caseSize || "", bbd: row.bbd || "", vat: row.vat || VAT_OPTIONS[0],
    quantity: row.quantity || "", rate: row.rate || "", amount: computeAmount(row.quantity, row.rate),
    orderStatus: "not_ordered", estimatedDeliveryDate: "", receivedQuantity: "", receivedDate: "", bbdReceived: "",
    receipts: [],
  }]);
  const addBulk = (rows) => rows.forEach(addProduct);
  const deleteProduct = (pid) => patchProducts((list) => list.filter((p) => p.id !== pid));

  const receiptField = (r, field, value) => {
    const allocField = field === "receivedQuantity" ? "receivedQty" : field;
    setAllocPatches((prev) => [...prev.filter((x) => !(x.poLineId === r.poLineId && x.pfiId === r.pfiId && x.field === allocField)),
      { poId: r.poId, poLineId: r.poLineId, pfiId: r.pfiId, field: allocField, value }]);
    patchProducts((list) => list.map((p) => ({
      ...p,
      receipts: (p.receipts || []).map((x) => (x.poLineId === r.poLineId && x.pfiId === r.pfiId ? { ...x, [field]: value } : x)),
    })));
  };

  const pendingKeys = new Set(reorderToggles.map((t) => t.key));
  const savedKeys = new Set(
    (actions.reorders || [])
      .filter((r) => r.pfiId === pfi.id)
      .map((r) => `${r.productId}::${r.poLineId || "manual"}`),
  );
  const reorderKeys = new Set(
    [...savedKeys, ...pendingKeys].filter((k) => !(savedKeys.has(k) && pendingKeys.has(k))),
  );

  const toggleReorder = (productId, receipt, shortQty) => {
    const key = `${productId}::${receipt ? receipt.poLineId : "manual"}`;
    setReorderToggles((prev) => (
      prev.some((t) => t.key === key)
        ? prev.filter((t) => t.key !== key)
        : [...prev, { key, productId, poLineId: receipt ? receipt.poLineId : null, poNo: receipt ? receipt.poNo : null, shortQty }]
    ));
  };

  const save = () => {
    actions.savePfi(draft, allocPatches, reorderToggles, isSale ? "sale" : "buyer");
    setAllocPatches([]);
    setReorderToggles([]);
  };

  const discard = () => {
    setDraft(pfi);
    setAllocPatches([]);
    setReorderToggles([]);
  };

  return (
    <div className="detail-body">
      <SaveBar
        dirty={dirty}
        onSave={save}
        onDiscard={discard}
        extra={isSale ? (
          <button className="btn btn-sm" onClick={() => exportPfiWorkbook(pfi)}><Download size={12} /> Export packing list</button>
        ) : null}
      />

      <ProductsTable
        pfi={draft}
        variant={isSale ? "pfi-sale" : "pfi-buyer"}
        onSaleField={saleField}
        onBuyerField={buyerField}
        onAddProduct={addProduct}
        onAddBulk={addBulk}
        onToggleReorder={toggleReorder}
        onDeleteProduct={deleteProduct}
        onReceiptField={receiptField}
        onAttachReceipt={attachReceipt}
        highlightProductId={highlightProductId}
        reorderKeys={reorderKeys}
      />
      <PfiDeliverySection
        delivery={draft.delivery}
        role={isSale ? "sale" : "buyer"}
        onChange={(patch) => setDraft((d) => ({ ...d, delivery: { ...d.delivery, ...patch } }))}
      />
      <DocumentsSection
        documents={draft.documents}
        canAdd={isSale}
        canEditStatus={!isSale}
        onAdd={(doc) => setDraft((d) => ({ ...d, documents: [doc, ...d.documents] }))}
        onStatusChange={(docId, status) => setDraft((d) => ({
          ...d, documents: d.documents.map((x) => (x.id === docId ? { ...x, status } : x)),
        }))}
      />
      {isSale && (
        <PaymentSection
          pfi={draft}
          canEdit={true}
          onAddPayment={(pay) => setDraft((d) => ({ ...d, payments: [...d.payments, pay] }))}
        />
      )}
    </div>
  );
}

function PfiCreateForm({ customers, existingNumbers, currency, setCurrency, onCreate, onCancel }) {
  const [customerId, setCustomerId] = useState(customers[0]?.id || "");
  const [pfiNo, setPfiNo] = useState("");
  const [paymentTerm, setPaymentTerm] = useState("");
  const [incoterm, setIncoterm] = useState(INCOTERMS[0].value);
  const [error, setError] = useState("");

  const submit = () => {
    if (!customerId) return;
    const num = pfiNo.trim();
    if (!/^\d+$/.test(num)) {
      setError("PFI number must be a number, for example 3200.");
      return;
    }
    if (existingNumbers.includes(num)) {
      setError(`PFI ${num} already exists. Use a different number.`);
      return;
    }
    setError("");
    onCreate({ customerId, pfiNo: num, paymentTerm: paymentTerm.trim(), incoterm, currency });
  };

  if (customers.length === 0) {
    return (
      <div className="add-form">
        <div className="muted">Add a customer in the Customer tab before creating a PFI.</div>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={onCancel}>Close</button>
      </div>
    );
  }

  return (
    <div className="add-form">
      <div className="form-grid">
        <div>
          <label>PFI number</label>
          <input inputMode="numeric" placeholder="3200" value={pfiNo} onChange={(e) => { setPfiNo(e.target.value); setError(""); }} />
        </div>
        <div>
          <label>Customer</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
          </select>
        </div>
        <div>
          <label>Currency</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label>Incoterm</label>
          <select value={incoterm} onChange={(e) => setIncoterm(e.target.value)}>
            {INCOTERMS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
          </select>
        </div>
        <div>
          <label>Payment term</label>
          <input value={paymentTerm} onChange={(e) => setPaymentTerm(e.target.value)} />
        </div>
      </div>
      {error && <div style={{ color: "#B23B3B", fontSize: 12, marginBottom: 8 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-accent" onClick={submit}>Create PFI</button>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function PfiList({ saleId, saleName, customers, pfis, expandedPfiId, setExpandedPfiId, feedSaleForThis, actions, pos, existingNumbers }) {
  const [showAdd, setShowAdd] = useState(false);
  const [currency, setCurrency] = useState("USD");

  const handleCreate = (data) => {
    const customer = customers.find((c) => c.id === data.customerId);
    const id = actions.addPfi(saleId, saleName, { ...data, customerName: customer.companyName });
    setShowAdd(false);
    setExpandedPfiId(id);
  };

  const toggle = (id) => {
    const willOpen = expandedPfiId !== id;
    setExpandedPfiId(willOpen ? id : null);
    if (willOpen) actions.markOrderFeedSeen(saleId, id);
  };

  const activityItems = feedSaleForThis.map((f) => ({
    id: f.id, seen: f.seenBySale, createdAt: f.createdAt,
    text: f.message, pfiId: f.pfiId,
  }));

  const openPfi = pfis.find((p) => p.id === expandedPfiId) || null;

  return (
    <div>
      <ActivityPanel
        title="Recent updates from Buyer"
        items={activityItems}
        emptyText="No updates from Buyer yet."
        onItemClick={(item) => toggle(item.pfiId)}
      />

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button className="btn btn-accent" onClick={() => setShowAdd((s) => !s)}><Plus size={14} /> Add PFI</button>
      </div>
      <div className="card">
        {showAdd && (
          <PfiCreateForm customers={customers} existingNumbers={existingNumbers} currency={currency} setCurrency={setCurrency} onCreate={handleCreate} onCancel={() => setShowAdd(false)} />
        )}
        {pfis.length === 0 && !showAdd ? (
          <div className="empty">
            <FileText size={30} />
            <div style={{ fontWeight: 600, marginBottom: 4 }}>No PFI yet</div>
            <div style={{ fontSize: 12.5 }}>Click "Add PFI" to create an order for a customer.</div>
          </div>
        ) : (
          <>
            <div className="pfi-list-head has-status">
              <div>Customer</div><div>Currency</div><div>Incoterm</div><div>Total</div><div>Payment</div><div>Status</div><div />
            </div>
            {pfis.map((p) => {
              const total = productTotal(p.products);
              const paid = paymentTotal(p.payments);
              const status = paymentStatus(total, paid);
              const tracking = pfiTrackingStatus(p);
              return (
                <div key={p.id} className={`pfi-list-row has-status ${expandedPfiId === p.id ? "open" : ""}`} onClick={() => toggle(p.id)}>
                  <div className="company-name">{p.customerName}<div className="pfi-code">{pfiLabel(p)}</div></div>
                  <div className="muted">{p.currency}</div>
                  <div className="muted">{INCOTERMS.find((i) => i.value === p.incoterm)?.label}</div>
                  <div className="muted sm-mono">{formatMoney(total, p.currency)}</div>
                  <div><span className={`chip ${status}`}>{paymentStatusLabel(status)}</span></div>
                  <div><span className={`chip ${TRACKING_TONE[tracking]}`}>{tracking}</span></div>
                  <ChevronRight size={16} className="chev" />
                </div>
              );
            })}
          </>
        )}
      </div>

      {openPfi && (
        <Modal
          title={`${pfiLabel(openPfi)} — ${openPfi.customerName}`}
          subtitle={`${openPfi.currency} · ${INCOTERMS.find((i) => i.value === openPfi.incoterm)?.label} · Payment term: ${openPfi.paymentTerm || "—"}`}
          deleteLabel="Delete PFI"
          onDelete={() => {
            setExpandedPfiId(null);
            actions.deletePfi(openPfi.saleId, openPfi.id);
          }}
          onClose={() => setExpandedPfiId(null)}
        >
          <PfiDetail pfi={openPfi} viewer="sale" actions={actions} pos={pos} />
        </Modal>
      )}
    </div>
  );
}

/* ---------------- Buyer: fulfillment view of all PFIs ---------------- */

function ReorderPanel({ reorders, onOpen, onHandled, onDismiss }) {
  const open = reorders.filter((r) => !r.handled);
  return (
    <div className="reorder-panel">
      <div className="reorder-head"><AlertTriangle size={13} /> Reorder requests {open.length > 0 ? `(${open.length})` : ""}</div>
      {reorders.length === 0 ? (
        <div className="activity-empty">Nothing to reorder right now.</div>
      ) : (
        <div className="reorder-scroll">
          {reorders.map((r) => (
            <div key={r.id} className={`reorder-row ${r.handled ? "handled" : ""}`} onClick={() => onOpen(r)}>
              <span className="reorder-qty">{r.shortQty} short</span>
              <div className="reorder-main">
                <div style={{ fontWeight: 600 }}>{r.product}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>
                  PFI {r.pfiNo} · {r.customerName} · {r.saleName}
                  {r.poNo ? ` · short on PO ${r.poNo}` : ""}
                  {r.caseSize ? ` · ${r.caseSize}` : ""}{r.ean ? ` · EAN ${r.ean}` : ""}
                </div>
              </div>
              <span className="ticket-time sm-mono">{timeAgo(r.createdAt)}</span>
              {!r.handled && (
                <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); onHandled(r.id); }}>Added to a PO</button>
              )}
              <button className="btn-icon" title="Dismiss" onClick={(e) => { e.stopPropagation(); onDismiss(r.id); }}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BuyerFulfillment({ pfisBySale, feedBuyerPfi, actions, pos, reorders }) {
  const [expanded, setExpanded] = useState(null);
  const [highlight, setHighlight] = useState(null);
  const allPfis = Object.values(pfisBySale).flat();

  const openPfi = (pfiId, productId) => {
    setExpanded(pfiId);
    setHighlight(productId || null);
    actions.markPfiFeedBuyerSeen(pfiId);
  };

  const activityItems = feedBuyerPfi.map((f) => ({
    id: f.id, seen: f.seenByBuyer, createdAt: f.createdAt,
    text: `${f.saleName} · ${f.customerName}: ${f.message}`, pfiId: f.pfiId,
  }));

  const openPfiRecord = allPfis.find((p) => p.id === expanded) || null;

  return (
    <div>
      <ReorderPanel
        reorders={reorders}
        onOpen={(r) => openPfi(r.pfiId, r.productId)}
        onHandled={actions.markReorderHandled}
        onDismiss={actions.dismissReorder}
      />

      <ActivityPanel
        title="Recent updates from Sale"
        items={activityItems}
        emptyText="No updates from Sale yet."
        onItemClick={(item) => openPfi(item.pfiId)}
      />

      {allPfis.length === 0 ? (
        <div className="card">
          <div className="empty">
            <Truck size={30} />
            <div style={{ fontWeight: 600 }}>No PFI to process yet</div>
            <div style={{ fontSize: 12.5 }}>When Sale creates a PFI, it will appear here for you to update order status, estimated delivery date, received quantity and BBD.</div>
          </div>
        </div>
      ) : (
        <div className="card">
          {allPfis.map((p) => (
            <div key={p.id} className={`fulfil-card ${expanded === p.id ? "open" : ""}`}>
              <div className="fulfil-head" onClick={() => openPfi(p.id)}>
                <div>
                  <div className="company-name">{p.customerName} <span className="muted">— {p.saleName}</span></div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div className="pfi-code">{pfiLabel(p)} · {p.products.length} product line(s)</div>
                    <span className={`chip ${TRACKING_TONE[pfiTrackingStatus(p)]}`}>{pfiTrackingStatus(p)}</span>
                  </div>
                </div>
                <ChevronRight size={16} className="chev" />
              </div>
            </div>
          ))}
        </div>
      )}

      {openPfiRecord && (
        <Modal
          title={`${pfiLabel(openPfiRecord)} — ${openPfiRecord.customerName}`}
          subtitle={`${openPfiRecord.saleName} · ${openPfiRecord.currency} · ${INCOTERMS.find((i) => i.value === openPfiRecord.incoterm)?.label}`}
          onClose={() => { setExpanded(null); setHighlight(null); }}
        >
          <PfiDetail pfi={openPfiRecord} viewer="buyer" actions={actions} pos={pos} highlightProductId={highlight} />
        </Modal>
      )}
    </div>
  );
}

/* ---------------- Buyer: PO Tracking (with suppliers) ---------------- */

function SupplierArea({ suppliers, pos, addSupplier }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", note: "" });

  const submit = () => {
    if (!form.name.trim()) return;
    addSupplier({ name: form.name.trim(), note: form.note.trim() });
    setForm({ name: "", note: "" });
    setShowAdd(false);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button className="btn btn-accent" onClick={() => setShowAdd((s) => !s)}><Plus size={14} /> Add supplier</button>
      </div>
      <div className="card">
        {showAdd && (
          <div className="add-form">
            <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div>
                <label>Supplier name</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label>Note</label>
                <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-accent" onClick={submit}>Save supplier</button>
              <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </div>
        )}
        {suppliers.length === 0 && !showAdd ? (
          <div className="empty">
            <Factory size={30} />
            <div style={{ fontWeight: 600, marginBottom: 4 }}>No suppliers yet</div>
            <div style={{ fontSize: 12.5 }}>Add a supplier to start creating POs.</div>
          </div>
        ) : (
          <>
            <div className="supplier-head"><div>Name</div><div>Note</div><div>POs</div></div>
            {suppliers.map((s) => (
              <div key={s.id} className="supplier-row">
                <div className="company-name">{s.name}</div>
                <div className="muted">{s.note || "—"}</div>
                <div className="muted">{pos.filter((p) => p.supplierId === s.id).length}</div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function PoCreateForm({ suppliers, existingNumbers, currency, setCurrency, onCreate, onCancel }) {
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || "");
  const [poNo, setPoNo] = useState("");
  const [paymentTerm, setPaymentTerm] = useState("");
  const [incoterm, setIncoterm] = useState(INCOTERMS[0].value);
  const [error, setError] = useState("");

  const submit = () => {
    if (!supplierId) return;
    const num = poNo.trim();
    if (!/^\d+$/.test(num)) {
      setError("PO number must be a number, for example 4500.");
      return;
    }
    if (existingNumbers.includes(num)) {
      setError(`PO ${num} already exists. Use a different number.`);
      return;
    }
    setError("");
    onCreate({ supplierId, poNo: num, paymentTerm: paymentTerm.trim(), incoterm, currency });
  };

  if (suppliers.length === 0) {
    return (
      <div className="add-form">
        <div className="muted">Add a supplier first (see the Suppliers tab) before creating a PO.</div>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={onCancel}>Close</button>
      </div>
    );
  }

  return (
    <div className="add-form">
      <div className="form-grid">
        <div>
          <label>PO number</label>
          <input inputMode="numeric" placeholder="4500" value={poNo} onChange={(e) => { setPoNo(e.target.value); setError(""); }} />
        </div>
        <div>
          <label>Supplier</label>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label>Currency</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label>Incoterm</label>
          <select value={incoterm} onChange={(e) => setIncoterm(e.target.value)}>
            {INCOTERMS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
          </select>
        </div>
        <div>
          <label>Payment term</label>
          <input value={paymentTerm} onChange={(e) => setPaymentTerm(e.target.value)} />
        </div>
      </div>
      {error && <div style={{ color: "#B23B3B", fontSize: 12, marginBottom: 8 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-accent" onClick={submit}>Create PO</button>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function PoDetail({ po, actions, allPfiOptions }) {
  const [draft, setDraft] = useState(po);

  React.useEffect(() => { setDraft(po); }, [po.id]);

  const dirty = strippedRecord(draft) !== strippedRecord(po);
  const patchProducts = (fn) => setDraft((d) => ({ ...d, products: fn(d.products) }));

  const productField = (pid, field, value) =>
    patchProducts((list) => list.map((p) => (p.id === pid ? withAmount(p, field, value) : p)));

  const addProduct = (row) => patchProducts((list) => [...list, {
    id: uid("prod"),
    product: row.product || "", ean: row.ean || "", caseBarcode: row.caseBarcode || "",
    caseSize: row.caseSize || "", bbd: row.bbd || "", vat: row.vat || VAT_OPTIONS[0],
    quantity: row.quantity || "", rate: row.rate || "", amount: computeAmount(row.quantity, row.rate),
    orderStatus: "not_ordered", estimatedDeliveryDate: "", receivedQuantity: "", receivedDate: "", bbdReceived: "",
    linkedPfiRefs: [],
  }]);
  const addBulk = (rows) => rows.forEach(addProduct);
  const deleteProduct = (pid) => patchProducts((list) => list.filter((p) => p.id !== pid));

  const toggleLink = (pid, opt) => patchProducts((list) => list.map((p) => {
    if (p.id !== pid) return p;
    const existing = p.linkedPfiRefs || [];
    const already = existing.some((r) => r.pfiId === opt.pfiId);
    return {
      ...p,
      linkedPfiRefs: already
        ? existing.filter((r) => r.pfiId !== opt.pfiId)
        : [...existing, {
          pfiId: opt.pfiId, saleId: opt.saleId, pfiProductId: matchPfiLine(opt.lines || [], null, p) || undefined,
          allocatedQty: "", receivedQty: "",
          orderStatus: p.orderStatus || "not_ordered", estimatedDeliveryDate: "", receivedDate: "", bbdReceived: "",
        }],
    };
  }));

  const allocationField = (pid, pfiId, field, value) => patchProducts((list) => list.map((p) => (
    p.id !== pid ? p : {
      ...p,
      linkedPfiRefs: (p.linkedPfiRefs || []).map((r) => (r.pfiId === pfiId ? { ...r, [field]: value } : r)),
    }
  )));

  const setStatus = (patch, orderStatus) => setDraft((d) => ({
    ...d,
    ...patch,
    products: d.products.map((p) => ({
      ...p,
      orderStatus,
      linkedPfiRefs: (p.linkedPfiRefs || []).map((r) => ({ ...r, orderStatus })),
    })),
  }));

  const setSent = (sentStatus) => setStatus(
    { sentStatus },
    draft.receivedStatus === "received" ? "received" : sentStatus === "sent" ? "ordered" : "sending_order",
  );
  const setReceived = (receivedStatus) => setStatus(
    { receivedStatus },
    receivedStatus === "received" ? "received" : draft.sentStatus === "sent" ? "ordered" : "sending_order",
  );

  return (
    <div className="detail-body">
      <SaveBar dirty={dirty} onSave={() => setDraft(actions.savePo(draft))} onDiscard={() => setDraft(po)} />

      <div className="po-status-bar">
        <div className="po-status-item">
          <span className="po-status-label">PO sent to supplier</span>
          <div className="toggle-pair">
            <button className={`toggle-btn ${draft.sentStatus === "sent" ? "sent-on" : ""}`} onClick={() => setSent("sent")}>Sent</button>
            <button className={`toggle-btn ${draft.sentStatus !== "sent" ? "notsent-on" : ""}`} onClick={() => setSent("not_sent")}>Have not Sent</button>
          </div>
        </div>
        <div className="po-status-item">
          <span className="po-status-label">Goods received</span>
          <div className="toggle-pair">
            <button className={`toggle-btn ${draft.receivedStatus === "received" ? "sent-on" : ""}`} onClick={() => setReceived("received")}>Received</button>
            <button className={`toggle-btn ${draft.receivedStatus !== "received" ? "notsent-on" : ""}`} onClick={() => setReceived("not_received")}>Not received yet</button>
          </div>
        </div>
        <div className="muted" style={{ maxWidth: 280, lineHeight: 1.5 }}>
          Received sets every PFI row on this PO to Received. Enter what each PFI actually got — a short delivery stays short.
        </div>
      </div>

      <ProductsTable
        pfi={draft}
        variant="po"
        onSaleField={productField}
        onBuyerField={productField}
        onAddProduct={addProduct}
        onAddBulk={addBulk}
        onToggleReorder={() => {}}
        onDeleteProduct={deleteProduct}
        allPfiOptions={allPfiOptions}
        onLinkPfiToggle={toggleLink}
        onAllocationField={allocationField}
      />
      <PoDeliverySection
        delivery={draft.delivery}
        onChange={(patch) => setDraft((d) => ({ ...d, delivery: { ...d.delivery, ...patch } }))}
      />
      <PaymentSection
        pfi={draft}
        canEdit={true}
        onAddPayment={(pay) => setDraft((d) => ({ ...d, payments: [...d.payments, pay] }))}
      />
    </div>
  );
}

function PoList({ suppliers, pos, expandedPoId, setExpandedPoId, actions, allPfiOptions }) {
  const [showAdd, setShowAdd] = useState(false);
  const [currency, setCurrency] = useState("USD");
  const [find, setFind] = useState("");
  const existingNumbers = pos.filter((p) => p.poNo).map((p) => String(p.poNo));
  const openPo = pos.find((p) => p.id === expandedPoId) || null;

  const fq = find.trim().toLowerCase();
  const visiblePos = fq
    ? pos.filter((p) => [p.poNo, p.supplierName].some((f) => String(f || "").toLowerCase().includes(fq)))
    : pos;

  const handleCreate = (data) => {
    const supplier = suppliers.find((s) => s.id === data.supplierId);
    const id = actions.addPo({ ...data, supplierName: supplier.name });
    setShowAdd(false);
    setExpandedPoId(id);
  };

  return (
    <div>
      <div className="overview-bar">
        <FindBar
          value={find}
          onChange={setFind}
          placeholder="Find a PO by number or supplier name…"
          total={pos.length}
          shown={visiblePos.length}
        />
        <button className="btn btn-accent" onClick={() => setShowAdd((s) => !s)}><Plus size={14} /> Add PO</button>
      </div>
      <div className="card">
        {showAdd && (
          <PoCreateForm suppliers={suppliers} existingNumbers={existingNumbers} currency={currency} setCurrency={setCurrency} onCreate={handleCreate} onCancel={() => setShowAdd(false)} />
        )}
        {visiblePos.length === 0 && !showAdd ? (
          <div className="empty">
            <Package size={30} />
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{fq ? "No PO matches that search" : "No PO yet"}</div>
            <div style={{ fontSize: 12.5 }}>{fq ? "Try the PO number or part of the supplier name." : 'Click "Add PO" to create a purchase order with a supplier.'}</div>
          </div>
        ) : (
          <>
            <div className="pfi-list-head">
              <div>Supplier</div><div>Currency</div><div>Incoterm</div><div>Total</div><div>Payment</div><div />
            </div>
            {visiblePos.map((p) => {
              const total = productTotal(p.products);
              const paid = paymentTotal(p.payments);
              const status = paymentStatus(total, paid);
              const isOpen = expandedPoId === p.id;
              return (
                <div key={p.id} className={`pfi-list-row ${isOpen ? "open" : ""}`} onClick={() => setExpandedPoId(isOpen ? null : p.id)}>
                  <div className="company-name">
                    {p.supplierName}
                    <div className="pfi-code">{poLabel(p)}</div>
                  </div>
                  <div className="muted">{p.currency}</div>
                  <div className="muted">{INCOTERMS.find((i) => i.value === p.incoterm)?.label}</div>
                  <div className="muted sm-mono">{formatMoney(total, p.currency)}</div>
                  <div><span className={`chip ${status}`}>{paymentStatusLabel(status)}</span></div>
                  <ChevronRight size={16} className="chev" />
                </div>
              );
            })}
          </>
        )}
      </div>

      {openPo && (
        <Modal
          title={`${poLabel(openPo)} — ${openPo.supplierName}`}
          subtitle={`${openPo.currency} · ${INCOTERMS.find((i) => i.value === openPo.incoterm)?.label} · Payment term: ${openPo.paymentTerm || "—"}`}
          deleteLabel="Delete PO"
          onDelete={() => {
            setExpandedPoId(null);
            actions.deletePo(openPo.id);
          }}
          onClose={() => setExpandedPoId(null)}
        >
          <PoDetail po={openPo} actions={actions} allPfiOptions={allPfiOptions} />
        </Modal>
      )}
    </div>
  );
}

function PoTrackingArea({ suppliers, pos, actions, allPfiOptions }) {
  const [subTab, setSubTab] = useState("suppliers");
  const [expandedPoId, setExpandedPoId] = useState(null);

  return (
    <div>
      <div className="pill-tabs">
        <div className={`pill ${subTab === "suppliers" ? "active" : ""}`} onClick={() => setSubTab("suppliers")}>Suppliers</div>
        <div className={`pill ${subTab === "po" ? "active" : ""}`} onClick={() => setSubTab("po")}>PO</div>
      </div>
      {subTab === "suppliers" && <SupplierArea suppliers={suppliers} pos={pos} addSupplier={actions.addSupplier} />}
      {subTab === "po" && <PoList suppliers={suppliers} pos={pos} expandedPoId={expandedPoId} setExpandedPoId={setExpandedPoId} actions={actions} allPfiOptions={allPfiOptions} />}
    </div>
  );
}

/* ---------------- Container Rate (shared by Admin, Sale and Buyer) ---------------- */

function bestQuote(lane) {
  const priced = lane.quotes.filter((q) => numOrNull(q.rate) !== null);
  if (priced.length === 0) return null;
  return priced.reduce((a, b) => (Number(b.rate) < Number(a.rate) ? b : a));
}

function ContainerRateTab({ lanes, actions, userName, canEdit }) {
  const [showAdd, setShowAdd] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [form, setForm] = useState({ pod: "", loadingAddress: "", containerType: CONTAINER_TYPES[0], transitTime: "" });
  const [quoteDraft, setQuoteDraft] = useState({});
  const [find, setFind] = useState("");

  const fq = find.trim().toLowerCase();
  const visibleLanes = fq
    ? lanes.filter((l) => [l.pod, l.loadingAddress, l.containerType].some((f) => String(f || "").toLowerCase().includes(fq)))
    : lanes;

  const submitLane = () => {
    if (!form.pod.trim() || !form.loadingAddress.trim()) return;
    const id = actions.addLane({
      ...form,
      pod: form.pod.trim(),
      loadingAddress: form.loadingAddress.trim(),
      transitTime: form.transitTime.trim(),
    });
    setForm({ pod: "", loadingAddress: "", containerType: CONTAINER_TYPES[0], transitTime: "" });
    setShowAdd(false);
    setExpanded(id);
  };

  const draftFor = (laneId) => quoteDraft[laneId] || { company: "", rate: "", currency: "USD" };
  const setDraft = (laneId, patch) => setQuoteDraft((d) => ({ ...d, [laneId]: { ...draftFor(laneId), ...patch } }));

  const submitQuote = (laneId) => {
    const d = draftFor(laneId);
    if (!d.company.trim() || !d.rate) return;
    actions.addQuote(laneId, { company: d.company.trim(), rate: d.rate, currency: d.currency, addedBy: userName });
    setQuoteDraft((q) => ({ ...q, [laneId]: { company: "", rate: "", currency: d.currency } }));
  };

  return (
    <div>
      <div className="overview-bar">
        <FindBar
          value={find}
          onChange={setFind}
          placeholder="Find a lane by POD, loading address or container…"
          total={lanes.length}
          shown={visibleLanes.length}
        />
        {canEdit && <button className="btn btn-accent" onClick={() => setShowAdd((s) => !s)}><Plus size={14} /> Add lane</button>}
      </div>
      {!canEdit && (
        <div className="demo-banner">Read-only view: rates are maintained by the Buyer team. Forwarder names are not shown here.</div>
      )}

      <div className="card">
        {canEdit && showAdd && (
          <div className="add-form">
            <div className="form-grid" style={{ gridTemplateColumns: "1fr 1.4fr 1fr 1fr" }}>
              <div>
                <label>POD</label>
                <input placeholder="Lagos, Apapa" value={form.pod} onChange={(e) => setForm({ ...form, pod: e.target.value })} />
              </div>
              <div>
                <label>Loading address</label>
                <input placeholder="20 Saddleback Road, Northampton" value={form.loadingAddress} onChange={(e) => setForm({ ...form, loadingAddress: e.target.value })} />
              </div>
              <div>
                <label>Type of container</label>
                <select value={form.containerType} onChange={(e) => setForm({ ...form, containerType: e.target.value })}>
                  {CONTAINER_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label>Transit time</label>
                <input placeholder="28 days" value={form.transitTime} onChange={(e) => setForm({ ...form, transitTime: e.target.value })} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-accent" onClick={submitLane}>Save lane</button>
              <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </div>
        )}

        {visibleLanes.length === 0 && !showAdd ? (
          <div className="empty">
            <Ship size={30} />
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{fq ? "No lane matches that search" : "No lanes yet"}</div>
            <div style={{ fontSize: 12.5 }}>{fq ? "Try part of the POD or loading address." : "Add a POD, loading address and container type, then record a rate for each forwarder you get a quote from."}</div>
          </div>
        ) : (
          <>
            <div className="lane-head-row">
              <div>POD</div><div>Loading address</div><div>Container</div><div>Transit time</div><div>Forwarders</div><div>Cheapest rate</div><div />
            </div>
            {visibleLanes.map((lane) => {
              const best = bestQuote(lane);
              const isOpen = expanded === lane.id;
              const d = draftFor(lane.id);
              return (
                <React.Fragment key={lane.id}>
                  <div className={`lane-row ${isOpen ? "open" : ""}`} onClick={() => setExpanded(isOpen ? null : lane.id)}>
                    <div className="company-name">{lane.pod}</div>
                    <div className="muted">{lane.loadingAddress}</div>
                    <div><span className="chip gray">{lane.containerType}</span></div>
                    <div className="muted">{lane.transitTime || "—"}</div>
                    <div className="muted">{lane.quotes.length === 0 ? "—" : `${lane.quotes.length} quoted`}</div>
                    <div>
                      {best ? (
                        <div>
                          <span className="sm-mono" style={{ fontWeight: 700, color: "#1F5B3D" }}>{formatMoney(best.rate, best.currency)}</span>
                          {canEdit && <div className="muted" style={{ fontSize: 11.5 }}>{best.company}</div>}
                        </div>
                      ) : <span className="muted">No rate yet</span>}
                    </div>
                    <ChevronRight size={16} className={`chev ${isOpen ? "open" : ""}`} />
                  </div>

                  {isOpen && (
                    <div className="lane-detail" onClick={(e) => e.stopPropagation()}>
                      <div className="section-title" style={{ marginBottom: 8 }}>
                        <span>{canEdit ? "Forwarder rates" : "Rates"} — {lane.pod} · {lane.containerType}</span>
                        {canEdit && <button className="btn btn-sm" onClick={() => actions.deleteLane(lane.id)}><Trash2 size={12} /> Delete lane</button>}
                      </div>

                      <div className="table-scroll" style={{ maxHeight: "none" }}>
                        <table className="data-table" style={{ minWidth: canEdit ? 560 : 340 }}>
                          <thead>
                            <tr>
                              {canEdit && <th style={{ minWidth: 200 }}>Forwarder</th>}
                              {!canEdit && <th style={{ minWidth: 90 }}>Quote</th>}
                              <th>Currency</th>
                              <th>Rate</th>
                              <th />
                              {canEdit && <th>Added by</th>}
                              {canEdit && <th />}
                            </tr>
                          </thead>
                          <tbody>
                            {lane.quotes.length === 0 && (
                              <tr><td colSpan={6} className="ro muted" style={{ padding: 12 }}>No rates recorded for this lane yet.</td></tr>
                            )}
                            {lane.quotes.map((q, i) => (
                              <tr key={q.id} className={best && q.id === best.id ? "parent-row" : ""}>
                                {canEdit
                                  ? <td><input value={q.company} onChange={(e) => actions.updateQuote(lane.id, q.id, "company", e.target.value)} /></td>
                                  : <td><span className="ro muted">Option {i + 1}</span></td>}
                                <td>
                                  {canEdit ? (
                                    <select value={q.currency} onChange={(e) => actions.updateQuote(lane.id, q.id, "currency", e.target.value)}>
                                      {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                  ) : <span className="ro">{q.currency}</span>}
                                </td>
                                <td>
                                  {canEdit
                                    ? <input type="number" value={q.rate} onChange={(e) => actions.updateQuote(lane.id, q.id, "rate", e.target.value)} />
                                    : <span className="ro sm-mono">{formatMoney(q.rate, q.currency)}</span>}
                                </td>
                                <td>{best && q.id === best.id ? <span className="chip green">Cheapest</span> : <span className="ro muted">—</span>}</td>
                                {canEdit && <td><span className="ro muted">{q.addedBy || "—"}</span></td>}
                                {canEdit && <td><button className="btn-icon" title="Remove rate" onClick={() => actions.deleteQuote(lane.id, q.id)}><Trash2 size={13} /></button></td>}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {canEdit && <div className="mini-form-row">
                        <div className="mini-field"><label>Forwarder</label><input value={d.company} onChange={(e) => setDraft(lane.id, { company: e.target.value })} style={{ width: 190 }} /></div>
                        <div className="mini-field">
                          <label>Currency</label>
                          <select value={d.currency} onChange={(e) => setDraft(lane.id, { currency: e.target.value })}>
                            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div className="mini-field"><label>Rate</label><input type="number" value={d.rate} onChange={(e) => setDraft(lane.id, { rate: e.target.value })} style={{ width: 110 }} /></div>
                        <button className="btn btn-accent btn-sm" onClick={() => submitQuote(lane.id)}><Plus size={12} /> Add rate</button>
                      </div>}
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------- Delivery Booking (Admin only) ---------------- */

function BookingDetail({ booking, actions }) {
  const [editing, setEditing] = useState(!booking.customerName && !booking.pod);
  const set = (field, value) => actions.updateBooking(booking.id, { [field]: value });
  const modeLabel = SHIPMENT_MODES.find((m) => m.value === booking.mode)?.label || "—";

  return (
    <div className="lane-detail" onClick={(e) => e.stopPropagation()}>
      <div className="section-title" style={{ marginBottom: 10 }}>
        <span>Booking details</span>
        <div className="actions">
          <button className={`btn btn-sm ${editing ? "btn-accent" : ""}`} onClick={() => setEditing((s) => !s)}>
            <Pencil size={12} /> {editing ? "Done editing" : "Edit"}
          </button>
          <button className="btn btn-sm" onClick={() => actions.deleteBooking(booking.id)}><Trash2 size={12} /> Delete</button>
        </div>
      </div>

      <div className="booking-grid">
        <div className="mini-field">
          <label>Status</label>
          <select className={`tone-${BOOKING_STATUS_TONE[booking.status] || "grey"}`} value={booking.status} onChange={(e) => set("status", e.target.value)}>
            {BOOKING_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        <div className="mini-field">
          <label>Customer</label>
          {editing ? <input value={booking.customerName} onChange={(e) => set("customerName", e.target.value)} /> : <div className="booking-value">{booking.customerName || "—"}</div>}
        </div>
        <div className="mini-field">
          <label>Sale</label>
          {editing ? <input placeholder="Sale rep's name" value={booking.saleName || ""} onChange={(e) => set("saleName", e.target.value)} /> : <div className="booking-value">{booking.saleName || "—"}</div>}
        </div>
        <div className="mini-field">
          <label>PFI / INV no.</label>
          {editing ? <input placeholder="3202" value={booking.docNo} onChange={(e) => set("docNo", e.target.value)} /> : <div className="booking-value sm-mono">{booking.docNo || "—"}</div>}
        </div>

        <div className="mini-field">
          <label>POD</label>
          {editing ? <input value={booking.pod} onChange={(e) => set("pod", e.target.value)} /> : <div className="booking-value">{booking.pod || "—"}</div>}
        </div>
        <div className="mini-field" style={{ gridColumn: "span 2" }}>
          <label>Loading address</label>
          {editing ? <input value={booking.loadingAddress} onChange={(e) => set("loadingAddress", e.target.value)} /> : <div className="booking-value">{booking.loadingAddress || "—"}</div>}
        </div>

        <div className="mini-field">
          <label>Shipment</label>
          {editing ? (
            <select value={booking.mode} onChange={(e) => actions.updateBooking(booking.id, { mode: e.target.value, subType: SHIPMENT_SUBTYPES[e.target.value][0] })}>
              {SHIPMENT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          ) : <div className="booking-value">{modeLabel}</div>}
        </div>
        <div className="mini-field">
          <label>Type</label>
          {editing ? (
            <select value={booking.subType} onChange={(e) => set("subType", e.target.value)}>
              {(SHIPMENT_SUBTYPES[booking.mode] || []).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : <div className="booking-value">{booking.subType || "—"}</div>}
        </div>
        <div className="mini-field">
          <label>Method</label>
          {editing ? (
            <select value={booking.method} onChange={(e) => set("method", e.target.value)}>
              {LOADING_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : <div className="booking-value">{booking.method || "—"}</div>}
        </div>
        <div className="mini-field">
          <label>Forwarder</label>
          {editing ? <input value={booking.forwarder} onChange={(e) => set("forwarder", e.target.value)} /> : <div className="booking-value">{booking.forwarder || "—"}</div>}
        </div>

        <div className="mini-field">
          <label>Rate</label>
          {editing ? (
            <div style={{ display: "flex", gap: 6 }}>
              <select value={booking.currency} onChange={(e) => set("currency", e.target.value)} style={{ width: 80 }}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input type="number" value={booking.rate} onChange={(e) => set("rate", e.target.value)} style={{ width: 110 }} />
            </div>
          ) : <div className="booking-value sm-mono">{booking.rate === "" ? "—" : formatMoney(booking.rate, booking.currency)}</div>}
        </div>
        <div className="mini-field">
          <label>Loading booked</label>
          {editing ? <DateField value={booking.loadingBooked} onChange={(v) => set("loadingBooked", v)} /> : <div className="booking-value">{fmtDate(booking.loadingBooked) || "—"}</div>}
        </div>
        <div className="mini-field">
          <label>Loading time</label>
          {editing ? <input type="time" value={booking.loadingTime} onChange={(e) => set("loadingTime", e.target.value)} /> : <div className="booking-value">{booking.loadingTime || "—"}</div>}
        </div>
        <div className="mini-field">
          <label>ETD</label>
          {editing ? <DateField value={booking.etd} onChange={(v) => set("etd", v)} /> : <div className="booking-value">{fmtDate(booking.etd) || "—"}</div>}
        </div>
        <div className="mini-field">
          <label>ETA</label>
          {editing ? <DateField value={booking.eta} onChange={(v) => set("eta", v)} /> : <div className="booking-value">{fmtDate(booking.eta) || "—"}</div>}
        </div>

        <div className="mini-field" style={{ gridColumn: "1 / -1" }}>
          <label>Note</label>
          {editing ? <textarea rows={2} value={booking.note} onChange={(e) => set("note", e.target.value)} /> : <div className="booking-value">{booking.note || "—"}</div>}
        </div>
      </div>
    </div>
  );
}

function DeliveryBookingTab({ bookings, actions }) {
  const [find, setFind] = useState("");
  const [expanded, setExpanded] = useState(null);

  const fq = find.trim().toLowerCase();
  const visible = fq
    ? bookings.filter((b) => [b.customerName, b.saleName, b.docNo, b.pod, b.loadingAddress, b.forwarder, b.note]
      .some((f) => String(f || "").toLowerCase().includes(fq)))
    : bookings;

  const add = () => setExpanded(actions.addBooking());

  return (
    <div>
      <div className="overview-bar">
        <FindBar
          value={find}
          onChange={setFind}
          placeholder="Find by customer, sale, PFI/INV no., POD or forwarder…"
          total={bookings.length}
          shown={visible.length}
        />
        <button className="btn btn-accent" onClick={add}><Plus size={14} /> Add booking</button>
      </div>

      <div className="card">
        {bookings.length === 0 ? (
          <div className="empty">
            <Truck size={30} />
            <div style={{ fontWeight: 600, marginBottom: 4 }}>No bookings yet</div>
            <div style={{ fontSize: 12.5 }}>Add a booking, then open it to fill in the shipment, forwarder and rate.</div>
          </div>
        ) : visible.length === 0 ? (
          <div className="empty">
            <Truck size={30} />
            <div style={{ fontWeight: 600 }}>No booking matches that search</div>
          </div>
        ) : (
          <>
            <div className="booking-head-row">
              <div>Customer</div><div>PFI / INV</div><div>POD</div><div>Loading address</div><div>Loading booked</div><div>ETD</div><div>ETA</div><div>Status</div><div />
            </div>
            {visible.map((b) => {
              const isOpen = expanded === b.id;
              return (
                <React.Fragment key={b.id}>
                  <div className={`booking-row ${isOpen ? "open" : ""}`} onClick={() => setExpanded(isOpen ? null : b.id)}>
                    <div className="company-name">{b.customerName || <span className="muted">New booking</span>}</div>
                    <div className="pfi-code" style={{ marginTop: 0 }}>{b.docNo || "—"}</div>
                    <div className="muted">{b.pod || "—"}</div>
                    <div className="muted">{b.loadingAddress || "—"}</div>
                    <div className="muted sm-mono">{fmtDate(b.loadingBooked) || "—"}{b.loadingTime ? ` ${b.loadingTime}` : ""}</div>
                    <div className="muted sm-mono">{fmtDate(b.etd) || "—"}</div>
                    <div className="muted sm-mono">{fmtDate(b.eta) || "—"}</div>
                    <div><span className={`chip ${b.status === "arrived" ? "green" : b.status === "pending" ? "gray" : "amber"}`}>{BOOKING_STATUS_LABEL[b.status]}</span></div>
                    <ChevronRight size={16} className={`chev ${isOpen ? "open" : ""}`} />
                  </div>
                  {isOpen && <BookingDetail booking={b} actions={actions} />}
                </React.Fragment>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------- Mai (Admin only): daily follow-up tasks ---------------- */

const MAI_STATUSES = [
  { value: "not_started", label: "Not started" },
  { value: "started", label: "Started" },
  { value: "waiting", label: "Waiting" },
  { value: "done", label: "Done" },
];
const MAI_STATUS_TONE = { not_started: "grey", started: "blue", waiting: "amber", done: "green" };

function MaiTab({ tasks, actions }) {
  const [form, setForm] = useState({ task: "", sale: "", supplier: "" });
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({});
  const [find, setFind] = useState("");
  const list = tasks || [];
  const fq = find.trim().toLowerCase();
  const visible = fq ? list.filter((t) => [t.task, t.sale, t.supplier].some((f) => String(f || "").toLowerCase().includes(fq))) : list;

  const submit = () => {
    if (!form.task.trim()) return;
    actions.addMaiTask(form);
    setForm({ task: "", sale: "", supplier: "" });
  };
  const onEnter = (e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } };
  const startEdit = (t) => { setEditing(t.id); setDraft({ task: t.task, sale: t.sale || "", supplier: t.supplier || "" }); };
  const saveEdit = () => { if (draft.task.trim()) actions.updateMaiTask(editing, { ...draft, task: draft.task.trim() }); setEditing(null); };

  return (
    <div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="add-form" style={{ borderBottom: "none" }}>
          <div className="form-grid" style={{ gridTemplateColumns: "2fr 1fr 1fr" }}>
            <div><label>Task</label><input placeholder="What needs following up" value={form.task} onChange={(e) => setForm({ ...form, task: e.target.value })} onKeyDown={onEnter} /></div>
            <div><label>Sale</label><input placeholder="Sale rep" value={form.sale} onChange={(e) => setForm({ ...form, sale: e.target.value })} onKeyDown={onEnter} /></div>
            <div><label>Supplier</label><input placeholder="Supplier" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} onKeyDown={onEnter} /></div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button className="btn btn-accent" onClick={submit}><Plus size={14} /> Add task</button>
            <span className="muted" style={{ fontSize: 12 }}>New tasks start as "Not started".</span>
          </div>
        </div>
      </div>

      <div className="overview-bar">
        <FindBar value={find} onChange={setFind} placeholder="Find a task by text, sale or supplier…" total={list.length} shown={visible.length} />
      </div>

      <div className="card">
        {list.length === 0 ? (
          <div className="empty">
            <ClipboardList size={30} />
            <div style={{ fontWeight: 600, marginBottom: 4 }}>No tasks yet</div>
            <div style={{ fontSize: 12.5 }}>Add the things you need to chase today; each row can be edited or deleted.</div>
          </div>
        ) : visible.length === 0 ? (
          <div className="empty"><ClipboardList size={30} /><div style={{ fontWeight: 600 }}>No task matches that search</div></div>
        ) : (
          <div className="table-scroll">
            <table className="data-table" style={{ minWidth: "auto" }}>
              <thead><tr><th style={{ minWidth: 280 }}>Task</th><th style={{ minWidth: 140 }}>Sale</th><th style={{ minWidth: 160 }}>Supplier</th><th>Status</th><th /></tr></thead>
              <tbody>
                {visible.map((t) => {
                  const isEdit = editing === t.id;
                  return (
                    <tr key={t.id} className={`mai-row ${t.status === "done" ? "row-done" : ""}`}>
                      <td>{isEdit ? <input value={draft.task} onChange={(e) => setDraft({ ...draft, task: e.target.value })} /> : <span className="ro">{t.task}</span>}</td>
                      <td>{isEdit ? <input value={draft.sale} onChange={(e) => setDraft({ ...draft, sale: e.target.value })} /> : <span className="ro">{t.sale || "—"}</span>}</td>
                      <td>{isEdit ? <input value={draft.supplier} onChange={(e) => setDraft({ ...draft, supplier: e.target.value })} /> : <span className="ro">{t.supplier || "—"}</span>}</td>
                      <td>
                        <select className={`tone-${MAI_STATUS_TONE[t.status] || "grey"}`} value={t.status || "not_started"} onChange={(e) => actions.updateMaiTask(t.id, { status: e.target.value })}>
                          {MAI_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {isEdit ? (
                          <>
                            <button className="btn btn-sm btn-accent" onClick={saveEdit}><Save size={12} /> Save</button>{" "}
                            <button className="btn btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button className="btn-icon" title="Edit task" onClick={() => startEdit(t)}><Pencil size={14} /></button>
                            <button className="btn-icon" title="Delete task" onClick={() => actions.deleteMaiTask(t.id)}><Trash2 size={14} /></button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Jobs (Buyer + Admin): jobs with a thread of Buyer's Notes ---------------- */

const JOB_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "rejected", label: "Rejected" },
  { value: "in_process", label: "In process" },
  { value: "done", label: "Done" },
];
const JOB_STATUS_LABEL = Object.fromEntries(JOB_STATUSES.map((s) => [s.value, s.label]));
const JOB_CHIP = { pending: "gray", rejected: "red", in_process: "blue", done: "green" };

function JobsTab({ jobs, actions, userName }) {
  const [form, setForm] = useState({ givenDate: todayIso(), jobs: "", maiNote: "" });
  const [expanded, setExpanded] = useState(null);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({});
  const [noteText, setNoteText] = useState({});
  const [find, setFind] = useState("");
  const list = jobs || [];
  const fq = find.trim().toLowerCase();
  const visible = fq ? list.filter((j) => [j.jobs, j.maiNote, ...(j.notes || []).map((n) => n.text)].some((f) => String(f || "").toLowerCase().includes(fq))) : list;

  const submit = () => {
    if (!form.jobs.trim()) return;
    const id = actions.addBuyerJob(form);
    setForm({ givenDate: todayIso(), jobs: "", maiNote: "" });
    setExpanded(id);
  };
  const startEdit = (j) => { setEditing(j.id); setExpanded(j.id); setDraft({ givenDate: j.givenDate || "", jobs: j.jobs, maiNote: j.maiNote || "" }); };
  const saveEdit = () => { if (draft.jobs.trim()) actions.updateBuyerJob(editing, { ...draft, jobs: draft.jobs.trim() }); setEditing(null); };
  const submitNote = (j) => {
    const text = (noteText[j.id] || "").trim();
    if (!text) return;
    actions.addBuyerJobNote(j.id, text, userName);
    setNoteText((n) => ({ ...n, [j.id]: "" }));
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="add-form" style={{ borderBottom: "none" }}>
          <div className="form-grid" style={{ gridTemplateColumns: "170px 2fr 2fr" }}>
            <div><label>Given date</label><DateField value={form.givenDate} onChange={(v) => setForm({ ...form, givenDate: v })} /></div>
            <div><label>Jobs</label><input placeholder="What the buyer is asked to do" value={form.jobs} onChange={(e) => setForm({ ...form, jobs: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }} /></div>
            <div><label>Mai's note</label><input placeholder="Context, priority, who asked" value={form.maiNote} onChange={(e) => setForm({ ...form, maiNote: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }} /></div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button className="btn btn-accent" onClick={submit}><Plus size={14} /> Add job</button>
            <span className="muted" style={{ fontSize: 12 }}>New jobs start as "Pending". Click a job to read and add Buyer's Notes.</span>
          </div>
        </div>
      </div>

      <div className="overview-bar">
        <FindBar value={find} onChange={setFind} placeholder="Find a job by text, Mai's note or a Buyer's Note…" total={list.length} shown={visible.length} />
      </div>

      <div className="card">
        {list.length === 0 ? (
          <div className="empty">
            <Briefcase size={30} />
            <div style={{ fontWeight: 600, marginBottom: 4 }}>No jobs yet</div>
            <div style={{ fontSize: 12.5 }}>Add a job with its given date and Mai's note; the buyer answers with Buyer's Notes.</div>
          </div>
        ) : visible.length === 0 ? (
          <div className="empty"><Briefcase size={30} /><div style={{ fontWeight: 600 }}>No job matches that search</div></div>
        ) : (
          <>
            <div className="jobs-head-row">
              <div>Given date</div><div>Jobs</div><div>Mai's note</div><div>Status</div><div>Notes</div><div /><div />
            </div>
            {visible.map((j) => {
              const isOpen = expanded === j.id;
              const notes = j.notes || [];
              return (
                <React.Fragment key={j.id}>
                  <div className={`jobs-row ${isOpen ? "open" : ""}`} onClick={() => setExpanded(isOpen ? null : j.id)}>
                    <div className="sm-mono">{fmtDate(j.givenDate) || "—"}</div>
                    <div style={{ fontWeight: 600 }}>{j.jobs}</div>
                    <div className="muted">{j.maiNote || "—"}</div>
                    <div><span className={`chip ${JOB_CHIP[j.status] || "gray"}`}>{JOB_STATUS_LABEL[j.status] || j.status}</span></div>
                    <div className="muted">{notes.length} note{notes.length === 1 ? "" : "s"}</div>
                    <div style={{ whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                      <button className="btn-icon" title="Edit job" onClick={() => startEdit(j)}><Pencil size={14} /></button>
                      <button className="btn-icon" title="Delete job" onClick={() => actions.deleteBuyerJob(j.id)}><Trash2 size={14} /></button>
                    </div>
                    <ChevronRight size={16} className={`chev ${isOpen ? "open" : ""}`} />
                  </div>
                  {isOpen && (
                    <div className="lane-detail job-detail" onClick={(e) => e.stopPropagation()}>
                      {editing === j.id && (
                        <div className="booking-grid" style={{ marginBottom: 14 }}>
                          <div className="mini-field"><label>Given date</label><DateField value={draft.givenDate} onChange={(v) => setDraft({ ...draft, givenDate: v })} /></div>
                          <div className="mini-field" style={{ gridColumn: "span 3" }}><label>Jobs</label><input value={draft.jobs} onChange={(e) => setDraft({ ...draft, jobs: e.target.value })} /></div>
                          <div className="mini-field" style={{ gridColumn: "1 / -1" }}><label>Mai's note</label><textarea rows={2} value={draft.maiNote} onChange={(e) => setDraft({ ...draft, maiNote: e.target.value })} /></div>
                          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
                            <button className="btn btn-sm btn-accent" onClick={saveEdit}><Save size={12} /> Save job</button>
                            <button className="btn btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                          </div>
                        </div>
                      )}

                      <div className="section-title" style={{ marginBottom: 8 }}>
                        <span>Buyer's Notes</span>
                        <span className="muted" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>Each note keeps the status the job had when it was written.</span>
                      </div>
                      {notes.length === 0 && <div className="activity-empty">No Buyer's Note yet.</div>}
                      {notes.map((n) => (
                        <div key={n.id} className="ticket answered job-note">
                          <div className="ticket-top">
                            <span className="ticket-status answered">{n.by || "Buyer"}</span>
                            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span className={`chip ${JOB_CHIP[n.statusAtTime] || "gray"}`}>{JOB_STATUS_LABEL[n.statusAtTime] || n.statusAtTime}</span>
                              <span className="ticket-time sm-mono">{fmtDate(n.createdAt)} · {timeAgo(n.createdAt)}</span>
                            </span>
                          </div>
                          <div className="ticket-content">{n.text}</div>
                        </div>
                      ))}
                      <div className="reply-box">
                        <textarea rows={2} placeholder="Add a Buyer's Note…" value={noteText[j.id] || ""} onChange={(e) => setNoteText((n) => ({ ...n, [j.id]: e.target.value }))} />
                        <button className="btn btn-accent btn-sm" onClick={() => submitNote(j)}><Send size={12} /> Add note</button>
                      </div>
                      <div className="mini-field" style={{ marginTop: 12, maxWidth: 220 }}>
                        <label>Status now</label>
                        <select value={j.status} onChange={(e) => actions.updateBuyerJob(j.id, { status: e.target.value })}>
                          {JOB_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------- Warehouse's Space (Admin, Buyer, Warehouse): delivery / collection calendar ---------------- */

const WH_TYPES = [
  { value: "delivery", label: "Delivery" },
  { value: "collection", label: "Collection" },
  { value: "other", label: "Other" },
];
const WH_TYPE_LABEL = Object.fromEntries(WH_TYPES.map((t) => [t.value, t.label]));
const MAX_VISIBLE_EVENTS = 4;

function WarehouseTab({ events, actions, userName }) {
  const [cursor, setCursor] = useState(() => startOfMonth(todayLocalIso()));
  const [editing, setEditing] = useState(null); // { id?, date, title, type, refNo, note }
  const [showAll, setShowAll] = useState(null); // ISO date whose cell shows every entry
  const today = todayLocalIso();
  const list = events || [];
  const byDay = {};
  for (const e of list) (byDay[e.date] ||= []).push(e);
  for (const k of Object.keys(byDay)) byDay[k].sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  const grid = monthGrid(cursor);
  const countThisMonth = list.filter((e) => inMonth(e.date || "", cursor)).length;

  const openNew = (date) => setEditing({ date, title: "", type: "delivery", refNo: "", note: "" });
  const openEdit = (e) => setEditing({ id: e.id, date: e.date, title: e.title, type: e.type || "delivery", refNo: e.refNo || "", note: e.note || "" });
  const saveEntry = () => {
    if (!editing || !editing.title.trim() || !editing.date) return;
    const { id, ...fields } = editing;
    if (id) actions.updateWarehouseEvent(id, { ...fields, title: fields.title.trim() });
    else actions.addWarehouseEvent({ ...fields, createdBy: userName });
    setCursor(startOfMonth(editing.date));
    setEditing(null);
  };
  const removeEntry = () => { if (editing && editing.id) actions.deleteWarehouseEvent(editing.id); setEditing(null); };

  return (
    <div>
      <div className="cal-toolbar">
        <div className="cal-title sm-display">{monthLabel(cursor)} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>· {countThisMonth} entr{countThisMonth === 1 ? "y" : "ies"}</span></div>
        <div className="cal-nav">
          <button className="btn btn-sm" title="Previous month" onClick={() => setCursor(addMonths(cursor, -1))}><ChevronLeft size={14} /></button>
          <button className="btn btn-sm" onClick={() => setCursor(startOfMonth(today))}>Today</button>
          <button className="btn btn-sm" title="Next month" onClick={() => setCursor(addMonths(cursor, 1))}><ChevronRight size={14} /></button>
          <span className="cal-legend" style={{ marginLeft: 8 }}>
            <span><span className="cal-dot" style={{ display: "inline-block", background: "#2B5A8A", marginRight: 4 }} />Delivery</span>
            <span><span className="cal-dot" style={{ display: "inline-block", background: "#A47521", marginRight: 4 }} />Collection</span>
            <span><span className="cal-dot" style={{ display: "inline-block", marginRight: 4 }} />Other</span>
          </span>
          <button className="btn btn-accent btn-sm" style={{ marginLeft: 8 }} onClick={() => openNew(today)}><Plus size={12} /> New entry</button>
        </div>
      </div>

      <div className="card cal-scroll">
        <div className="cal-head">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d}>{d}</div>)}</div>
        <div className="cal-grid">
          {grid.map((iso) => {
            const dayEvents = byDay[iso] || [];
            const expanded = showAll === iso;
            const shown = expanded ? dayEvents : dayEvents.slice(0, MAX_VISIBLE_EVENTS);
            return (
              <div key={iso} className={`cal-day ${inMonth(iso, cursor) ? "" : "out"} ${iso === today ? "today" : ""}`} data-date={iso} onDoubleClick={() => openNew(iso)}>
                <div className="cal-day-top">
                  <span className="cal-date">{Number(iso.slice(8, 10))}</span>
                  <button className="cal-add" title={`Add an entry on ${fmtDate(iso)}`} onClick={() => openNew(iso)}>+</button>
                </div>
                {shown.map((e) => (
                  <button key={e.id} className={`cal-event type-${e.type || "other"}`} title={`${WH_TYPE_LABEL[e.type] || "Other"}${e.refNo ? ` · ${e.refNo}` : ""}${e.note ? `\n${e.note}` : ""}`} onClick={() => openEdit(e)}>
                    <span className="cal-dot" /><span className="cal-text">{e.title}</span>
                  </button>
                ))}
                {!expanded && dayEvents.length > MAX_VISIBLE_EVENTS && (
                  <button className="cal-more" onClick={() => setShowAll(iso)}>+{dayEvents.length - MAX_VISIBLE_EVENTS} more</button>
                )}
                {expanded && <button className="cal-more" onClick={() => setShowAll(null)}>show less</button>}
              </div>
            );
          })}
        </div>
      </div>

      {editing && (
        <Modal
          title={editing.id ? "Entry" : "New entry"}
          subtitle={`${fmtDate(editing.date) || "no date"}${editing.id ? "" : " · double-click a day to add there"}`}
          deleteLabel={editing.id ? "Delete entry" : undefined}
          onDelete={editing.id ? removeEntry : undefined}
          onClose={() => setEditing(null)}
        >
          <div className="booking-grid" style={{ marginBottom: 14 }}>
            <div className="mini-field" style={{ gridColumn: "span 2" }}>
              <label>Title</label>
              <input autoFocus placeholder="e.g. Siam PO 2424 · 2 pallets" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveEntry(); } }} />
            </div>
            <div className="mini-field"><label>Date</label><DateField value={editing.date} onChange={(v) => setEditing({ ...editing, date: v })} /></div>
            <div className="mini-field">
              <label>Type</label>
              <select value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value })}>
                {WH_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="mini-field"><label>PO / PFI no.</label><input placeholder="2424" value={editing.refNo} onChange={(e) => setEditing({ ...editing, refNo: e.target.value })} /></div>
            <div className="mini-field" style={{ gridColumn: "span 3" }}><label>Note</label><textarea rows={2} placeholder="Pallets, time window, driver…" value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} /></div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="btn btn-accent" disabled={!editing.title.trim() || !editing.date} onClick={saveEntry}><Save size={14} /> Save entry</button>
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------------- AI agent link (Admin, Sale, Buyer): connect Claude / ChatGPT through MCP ---------------- */

const AGENT_TOOLS = {
  sale: ["list_customers", "list_pfis", "get_pfi", "create_pfi", "add_pfi_lines"],
  buyer: ["list_customers", "list_pfis", "get_pfi", "create_pfi", "add_pfi_lines", "list_pos", "get_po", "add_po_lines", "list_jobs", "add_job", "add_job_note", "list_warehouse_events", "add_warehouse_event"],
  admin: ["list_customers", "list_pfis", "get_pfi", "create_pfi", "add_pfi_lines", "list_pos", "get_po", "add_po_lines", "list_tasks", "add_task", "list_jobs", "add_job", "add_job_note", "list_warehouse_events", "add_warehouse_event"],
};

const ASSISTANTS = [
  { id: "claude", label: "Claude.ai", hint: "web and desktop app · Claude Pro, Max, Team or Enterprise" },
  { id: "chatgpt", label: "ChatGPT", hint: "Plus, Pro or Business · Developer mode" },
  { id: "code", label: "Claude Code", hint: "terminal" },
];

function AgentLinkTab({ user, accounts }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}/mcp`;
  const me = (accounts || []).find((a) => a.id === user.id);
  const username = me ? me.username : "";
  const [password, setPassword] = useState(me && me.password ? me.password : "");
  const [assistant, setAssistant] = useState("claude");
  const [copied, setCopied] = useState("");
  const [test, setTest] = useState({ state: "idle", message: "" });
  const hasPassword = Boolean(password);
  const key = `${username}:${password || "your-password"}`;
  const command = `claude mcp add --transport http sale-buying-console ${url} --header "X-API-Key: ${key}"`;
  const keyedUrl = `${url}?key=${key}`; // Claude.ai's dialog has no header field, so the key travels in the URL, like ChatGPT
  const gptUrl = keyedUrl;
  const claudeLink = `https://claude.ai/settings/connectors?modal=add-custom-connector&mcpName=${encodeURIComponent("Sale & Buying Console")}&mcpServerUrl=${encodeURIComponent(keyedUrl)}`;
  const copy = async (what, value) => {
    try { await navigator.clipboard.writeText(value); setCopied(what); setTimeout(() => setCopied(""), 1500); } catch { /* clipboard blocked: the text is on screen to select */ }
  };
  const CopyBtn = ({ what, value, label = "Copy" }) => <button className="btn btn-sm" onClick={() => copy(what, value)}>{copied === what ? "Copied" : label}</button>;
  const tools = AGENT_TOOLS[user.role] || AGENT_TOOLS.sale;
  const isSale = user.role === "sale";
  const isAdmin = user.role === "admin";
  const chosen = ASSISTANTS.find((a) => a.id === assistant);
  const [docKind, setDocKind] = useState("PFI");
  const [docNo, setDocNo] = useState("");
  const pdfPrompt = `Read the attached document (it is a ${docKind === "PFI" ? "proforma / order from a customer" : "supplier order confirmation"}). Add every product line to ${docKind} ${docNo || "____"} in the Sale & Buying Console with ${docKind === "PFI" ? "add_pfi_lines" : "add_po_lines"}, in one call. Keep product name, EAN, case barcode, pack, BBD, quantity, rate and VAT exactly as printed; skip subtotal and total rows. Show me the lines you found before adding them.`;

  // Phase 2: call the real endpoint with the key, exactly as Claude or ChatGPT will.
  const testKey = async () => {
    if (!hasPassword) { setTest({ state: "err", message: "Type your password first." }); return; }
    setTest({ state: "busy", message: "Checking…" });
    try {
      const res = await fetch("/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "x-api-key": key }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) });
      const json = await res.json().catch(() => null);
      if (res.status === 401) setTest({ state: "err", message: "Not accepted. Check the username, the colon and the password — no spaces." });
      else if (!res.ok || !json || !json.result) setTest({ state: "err", message: `The server answered ${res.status}${json && json.error ? `: ${json.error.message}` : ""}.` });
      else setTest({ state: "ok", message: `Connected — ${json.result.tools.length} tools available to you.` });
    } catch (err) {
      setTest({ state: "err", message: `Could not reach ${url}: ${err && err.message ? err.message : err}` });
    }
  };

  const phase3 = {
    claude: (
      <ol className="agent-substeps">
        {!hasPassword && <li className="agent-warn">Type your password in phase 2 first, so the link below carries your key.</li>}
        <li>Click <a className="agent-claude-btn" href={claudeLink} target="_blank" rel="noreferrer">Add to Claude.ai ↗</a>. It opens claude.ai › Settings › Connectors with the "Add custom connector" dialog already filled in: Name <code>Sale &amp; Buying Console</code>, Remote MCP server URL <code>{keyedUrl}</code> (your key is inside the URL, the dialog has no header field). If the dialog does not open, go to Settings → Connectors → <b>Add custom connector</b> and paste those two values. <CopyBtn what="url" value={keyedUrl} label="Copy URL" /></li>
        <li>Leave the rest as it is: Authentication <b>Register automatically</b>, and under Advanced, Transport <b>Streamable HTTP</b>. No OAuth login will appear because the server accepts the key in the URL.</li>
        <li>Click <b>Add</b>. The connector now appears in your Connectors list; leave it switched on.</li>
        <li>Open a new chat. Under the "+" or tools button, make sure <b>Sale &amp; Buying Console</b> is ticked. The Claude desktop app picks the connector up by itself.</li>
      </ol>
    ),
    chatgpt: (
      <ol className="agent-substeps">
        <li>Open ChatGPT → <b>Settings</b> → <b>Apps &amp; Connectors</b> → <b>Advanced settings</b> → turn on <b>Developer mode</b>.</li>
        <li>Back in Apps &amp; Connectors click <b>Create</b>.</li>
        <li>Name: <code>Sale &amp; Buying Console</code>. MCP server URL: <code>{gptUrl}</code> <CopyBtn what="gpt" value={gptUrl} label="Copy URL" />. ChatGPT has no header field, so the key travels inside the URL. Authentication: <b>No authentication</b>. Click <b>Create</b>.</li>
        <li>In a new chat click "+" → <b>More</b> and tick <b>Sale &amp; Buying Console</b> so this conversation may use it.</li>
      </ol>
    ),
    code: (
      <ol className="agent-substeps">
        <li>Open a terminal on the computer where Claude Code is installed.</li>
        <li>Paste and run: <pre className="agent-cmd">{command}</pre> <CopyBtn what="cmd" value={command} label="Copy command" /></li>
        <li>Start <code>claude</code>, type <code>/mcp</code>: <b>sale-buying-console</b> should show as connected.</li>
      </ol>
    ),
  };
  const removeHow = {
    claude: "claude.ai → Settings → Connectors → Sale & Buying Console → Remove. (The key sits in the connector URL, so removing the connector removes it.)",
    chatgpt: "ChatGPT → Settings → Apps & Connectors → Sale & Buying Console → Delete.",
    code: "Run: claude mcp remove sale-buying-console",
  };
  const examples = isSale
    ? ["Which PFIs can you see?", "Here is a proforma (attach the PDF or paste the lines): add its product lines to PFI 3200.", "Create PFI 3400 for Acme Foods Ltd in GBP, payment term Credit - 30 days."]
    : [
      "List the POs and tell me which ones are not sent yet.",
      "Add the lines from this supplier confirmation to PO 4500.",
      "Add a job: get a container quote to Lagos, given today, Mai's note: urgent.",
      "Add a Buyer's Note to the Lagos job: MSC quoted 3,990, and set it to In process.",
      "Put a collection on the warehouse calendar on 25/09/2026: Siam PO 2424, 2 pallets.",
      "What is on the warehouse calendar this month?",
      ...(isAdmin ? ["Add a Mai task: chase the COO for PFI 3200, supplier Yogi Tea."] : []),
    ];

  return (
    <div className="card agent-card">
      <div className="agent-lead">Connect Claude / ChatGPT to <code>{url}</code> · API key: <code>{key}</code></div>
      <div className="muted agent-note">
        Your own Claude or ChatGPT subscription does the work; nothing extra to pay. It reads the console live in every chat and adds what you ask, as you.
        A sale rep sees their own customers and PFIs; Buyer and Admin see everything. Nothing you paste into Claude or ChatGPT is stored here — only what you ask them to add.
      </div>

      <ol className="agent-phases">
        <li className="agent-phase">
          <div className="agent-phase-head"><span className="agent-phase-no">1</span><div><b>Choose your assistant</b><div className="muted">The steps below change with your choice.</div></div></div>
          <div className="agent-pick">
            {ASSISTANTS.map((a) => (
              <button key={a.id} className={`pill ${assistant === a.id ? "active" : ""}`} onClick={() => setAssistant(a.id)}>{a.label}<span className="agent-pick-hint">{a.hint}</span></button>
            ))}
          </div>
        </li>

        <li className="agent-phase">
          <div className="agent-phase-head"><span className="agent-phase-no">2</span><div><b>Get your key and check it</b><div className="muted">The key is your console login written as <code>username:password</code>. Same login, same rights.</div></div></div>
          <div className="agent-keyrow">
            <div className="mini-field"><label>Username</label><input value={username} readOnly /></div>
            <div className="mini-field agent-pass"><label>{me && me.password ? "Password (from Accounts)" : "Your password — stays in this page"}</label><input type="password" placeholder="password" value={password} onChange={(e) => { setPassword(e.target.value); setTest({ state: "idle", message: "" }); }} /></div>
            <div className="mini-field"><label>Your key</label><div className="agent-keybox"><code>{key}</code> <CopyBtn what="key2" value={key} label="Copy key" /></div></div>
          </div>
          <div className="agent-testrow">
            <button className="btn btn-accent btn-sm" disabled={test.state === "busy"} onClick={testKey}>{test.state === "busy" ? "Checking…" : "Test my key"}</button>
            {test.message && <span className={`agent-test-result ${test.state}`}>{test.message}</span>}
            <span className="muted">Same call Claude or ChatGPT will make. Green here means the connection will work.</span>
          </div>
        </li>

        <li className="agent-phase">
          <div className="agent-phase-head"><span className="agent-phase-no">3</span><div><b>Connect {chosen.label}</b><div className="muted">{chosen.hint}</div></div></div>
          {phase3[assistant]}
        </li>

        <li className="agent-phase">
          <div className="agent-phase-head"><span className="agent-phase-no">4</span><div><b>Check it works</b><div className="muted">One question is enough.</div></div></div>
          <ol className="agent-substeps">
            <li>Start a new chat and ask: <code>{isSale ? "Which PFIs can you see?" : "List the POs you can see."}</code></li>
            <li>The first time, the assistant asks permission to use the tool — allow it. It then answers with your real records{isSale ? " (your own PFIs only)" : ""}.</li>
            <li>If it says it has no such tool, go back to phase 3 step 4 and tick the connector for that chat.</li>
          </ol>
          <table className="data-table agent-fix" style={{ minWidth: "auto" }}>
            <thead><tr><th>If you see</th><th>Do this</th></tr></thead>
            <tbody>
              <tr><td>"Unauthorized" or the connector will not save</td><td>The key is wrong. Use phase 2: username, a colon, your password, no spaces. Test it there.</td></tr>
              <tr><td>"… not available to the {user.role} role"</td><td>That action belongs to another role. The list of what your role can do is at the bottom.</td></tr>
              <tr><td>It added something but the console does not show it</td><td>Wait up to 20 seconds or refresh the page. It appears as your own change, and Buyer gets the usual notification.</td></tr>
              <tr><td>You changed your console password</td><td>Remove and re-add the connector with the new URL (Claude.ai and ChatGPT) or re-run the command (Claude Code).</td></tr>
            </tbody>
          </table>
        </li>

        <li className="agent-phase">
          <div className="agent-phase-head"><span className="agent-phase-no">5</span><div><b>Use it every day</b><div className="muted">Things people ask, for your role.</div></div></div>
          <ul className="agent-examples">{examples.map((e) => <li key={e}><code>{e}</code></li>)}</ul>
          <div className="muted agent-limits">
            It can read and add. It cannot delete anything, change order statuses on PO rows, or open files attached in the console. Every line it adds is validated like Import PDF (totals rows dropped, barcodes check-digit tested).
            To disconnect: {removeHow[assistant]}
          </div>
        </li>
      </ol>

      <div className="agent-pdf">
        <h3>Import a PDF or a photo with no daily limit</h3>
        <div className="muted">The Import PDF button in the console uses a free AI allowance that runs out on busy days. Your assistant reads documents itself, so this path has no daily cap.</div>
        <ol className="agent-substeps" style={{ marginTop: 8 }}>
          <li>Note the {isSale ? "PFI" : "PFI or PO"} number the lines belong to. It must already exist in the console.</li>
          <li>In {chosen.label}, attach the PDF or the photo of the document.</li>
          <li>Paste this message and send it:
            <div className="agent-pdf-row">
              {!isSale && (
                <div className="mini-field"><label>Document</label>
                  <select value={docKind} onChange={(e) => setDocKind(e.target.value)}><option value="PFI">PFI (customer order)</option><option value="PO">PO (supplier)</option></select>
                </div>
              )}
              <div className="mini-field"><label>{docKind} number</label><input inputMode="numeric" placeholder="3200" value={docNo} onChange={(e) => setDocNo(e.target.value.trim())} style={{ width: 120 }} /></div>
              <CopyBtn what="pdf" value={pdfPrompt} label="Copy message" />
            </div>
            <pre>{pdfPrompt}</pre>
          </li>
          <li>It lists the lines it read; reply "yes". Within 20 seconds the lines are on the {docKind} in the console, with a note "… via Claude" in the activity feed, and the usual barcode checks applied.</li>
        </ol>
      </div>

      <details className="agent-quick">
        <summary>Quick reference — all three at once</summary>
        <div className="agent-grid">
          <section><h3>Claude Code</h3><pre className="agent-cmd">{command}</pre><CopyBtn what="cmd2" value={command} label="Copy command" /></section>
          <section><h3>Claude.ai</h3><a className="agent-claude-btn" href={claudeLink} target="_blank" rel="noreferrer">Add to Claude.ai ↗</a><div className="muted">URL with the key inside: <code>{keyedUrl}</code>; keep Register automatically + Streamable HTTP, click Add</div></section>
          <section><h3>ChatGPT</h3><pre className="agent-cmd">{gptUrl}</pre><CopyBtn what="gpt2" value={gptUrl} label="Copy URL" /></section>
        </div>
      </details>

      <div className="agent-foot muted">
        <div>Tools for your role: {tools.join(" · ")}</div>
        {isAdmin && <div>Shared admin key for the whole team: set the <code>MCP_API_KEY</code> secret on the Worker.</div>}
      </div>
    </div>
  );
}

/* ---------------- Accounts (Admin only) ---------------- */

function AccountsTab({ accounts, actions, currentUserId }) {
  const [form, setForm] = useState({ role: "sale", name: "", username: "", password: "" });
  const [error, setError] = useState("");
  const [reveal, setReveal] = useState({});

  const submit = () => {
    const name = form.name.trim();
    const username = form.username.trim();
    if (!name || !username || !form.password) {
      setError("Name, username and password are all required.");
      return;
    }
    if (accounts.some((a) => a.username.toLowerCase() === username.toLowerCase())) {
      setError(`Username "${username}" is already taken.`);
      return;
    }
    setError("");
    actions.addAccount({ ...form, name, username });
    setForm({ role: "sale", name: "", username: "", password: "" });
  };

  const remove = (acc) => {
    if (acc.id === currentUserId) return;
    if (acc.role === "admin" && accounts.filter((a) => a.role === "admin").length <= 1) return;
    actions.deleteAccount(acc.id);
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="add-form" style={{ borderBottom: "none" }}>
          <div className="form-grid" style={{ gridTemplateColumns: "0.8fr 1.2fr 1fr 1fr" }}>
            <div>
              <label>Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label>Full name</label>
              <input value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); setError(""); }} />
            </div>
            <div>
              <label>Username</label>
              <input value={form.username} onChange={(e) => { setForm({ ...form, username: e.target.value }); setError(""); }} />
            </div>
            <div>
              <label>Password</label>
              <input value={form.password} onChange={(e) => { setForm({ ...form, password: e.target.value }); setError(""); }} />
            </div>
          </div>
          {error && <div style={{ color: "#B23B3B", fontSize: 12, marginBottom: 8 }}>{error}</div>}
          <button className="btn btn-accent" onClick={submit}><Plus size={14} /> Create account</button>
        </div>
      </div>

      <div className="card">
        <div className="account-head-row">
          <div>Role</div><div>Name</div><div>Username</div><div>Password</div><div />
        </div>
        {accounts.map((acc) => {
          const isSelf = acc.id === currentUserId;
          const lastAdmin = acc.role === "admin" && accounts.filter((a) => a.role === "admin").length <= 1;
          return (
            <div key={acc.id} className="account-row">
              <div><span className={`chip ${acc.role === "admin" ? "green" : acc.role === "buyer" ? "amber" : "gray"}`}>{acc.role}</span></div>
              <div><input value={acc.name} onChange={(e) => actions.updateAccount(acc.id, { name: e.target.value })} /></div>
              <div><input value={acc.username} onChange={(e) => actions.updateAccount(acc.id, { username: e.target.value })} /></div>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type={reveal[acc.id] ? "text" : "password"}
                  value={acc.password}
                  onChange={(e) => actions.updateAccount(acc.id, { password: e.target.value })}
                />
                <button className="btn btn-sm" onClick={() => setReveal((r) => ({ ...r, [acc.id]: !r[acc.id] }))}>
                  {reveal[acc.id] ? "Hide" : "Show"}
                </button>
              </div>
              <div>
                <button
                  className="btn-icon"
                  title={isSelf ? "You cannot delete your own account" : lastAdmin ? "Keep at least one admin" : "Delete account"}
                  disabled={isSelf || lastAdmin}
                  style={{ opacity: isSelf || lastAdmin ? 0.3 : 1 }}
                  onClick={() => remove(acc)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- Shell / App ---------------- */

function Shell({ user, onLogout, store }) {
  const isAdmin = user.role === "admin";
  const isSale = user.role === "sale";
  const isBuyer = user.role === "buyer";
  const isWarehouse = user.role === "warehouse";

  const salesReps = store.accounts.filter((a) => a.role === "sale");
  const [selectedSaleId, setSelectedSaleId] = useState(isSale ? user.id : (salesReps[0]?.id || ""));
  const [topSection, setTopSection] = useState(() => {
    const hash = typeof window !== "undefined" ? window.location.hash.replace("#", "") : "";
    if (hash === "agent" && !isWarehouse) return "agent";
    return isWarehouse ? "warehouse" : isBuyer ? "buyerspace" : "customer";
  });
  // `/#agent` also works while the app is already open (the import hint opens it in a new tab, but a pasted link may not).
  React.useEffect(() => {
    const onHash = () => { if (window.location.hash === "#agent" && !isWarehouse) setTopSection("agent"); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [isWarehouse]);
  const [subSection, setSubSection] = useState("customer");
  const [buyerSubTab, setBuyerSubTab] = useState("feed");
  const [expandedPfiId, setExpandedPfiId] = useState(null);

  const selectedRep = salesReps.find((r) => r.id === selectedSaleId) || salesReps[0] || { id: "", name: "—" };
  const currentSaleId = isSale ? user.id : selectedSaleId;
  const currentCustomers = store.customersBySale[currentSaleId] || [];
  const currentPfis = store.pfisBySale[currentSaleId] || [];

  const allPfiOptions = [];
  const allPfiNumbers = [];
  salesReps.forEach((rep) => {
    (store.pfisBySale[rep.id] || []).forEach((p) => {
      if (p.pfiNo) allPfiNumbers.push(String(p.pfiNo));
      allPfiOptions.push({
        pfiId: p.id,
        saleId: rep.id,
        shortLabel: pfiLabel(p),
        customerName: p.customerName,
        lines: (p.products || []).map(({ id, product, ean, caseBarcode }) => ({ id, product, ean, caseBarcode })),
        label: `${pfiLabel(p)} — ${p.customerName}`,
        search: `${p.pfiNo || ""} ${p.customerName}`,
      });
    });
  });

  const pendingCount = store.feed.filter((f) => f.status === "sent").length;
  const answeredUnseenCount = isSale
    ? currentCustomers.reduce((acc, c) => acc + c.notes.filter((n) => n.status === "answered" && !n.seenBySale).length, 0)
    : 0;
  const feedSaleForCurrent = store.feedSale.filter((f) => f.saleId === currentSaleId);
  const orderFeedUnseenCount = isSale
    ? store.feedSale.filter((f) => f.saleId === user.id && !f.seenBySale).length
    : 0;
  const fulfillmentUnseenCount = store.feedBuyerPfi.filter((f) => !f.seenByBuyer).length;
  const openReorderCount = store.reorders.filter((r) => !r.handled).length;

  const openPfiFromCustomer = (pfiId) => {
    setTopSection("customer");
    setSubSection("orders");
    setExpandedPfiId(pfiId);
  };

  return (
    <div className="sm-root">
      <GlobalStyle />
      <div className="shell">
        <div className="sidebar">
          <div className="brand">
            <img className="brand-logo" src={LOGO_SRC} alt="FMCG Trading Ltd" />
            <span className="brand-name sm-display">{COMPANY_NAME}</span>
          </div>

          {isAdmin && (
            <>
              <div className="side-section-label">Sale team</div>
              {salesReps.map((rep) => (
                <div
                  key={rep.id}
                  className={`side-item ${topSection === "customer" && selectedSaleId === rep.id ? "active" : ""}`}
                  onClick={() => { setSelectedSaleId(rep.id); setTopSection("customer"); setSubSection("customer"); setExpandedPfiId(null); }}
                >
                  <Users size={14} /> {rep.name}
                </div>
              ))}
              <div className="side-section-label">Buyer</div>
              <div className={`side-item ${topSection === "buyerspace" ? "active" : ""}`} onClick={() => setTopSection("buyerspace")}>
                <Package size={14} /> Buyer Space
                {(pendingCount + fulfillmentUnseenCount) > 0 && <span className="badge-mini">{pendingCount + fulfillmentUnseenCount}</span>}
              </div>
              <div className="side-section-label">Admin</div>
              <div className={`side-item ${topSection === "mai" ? "active" : ""}`} onClick={() => setTopSection("mai")}>
                <ClipboardList size={14} /> Mai
              </div>
            </>
          )}

          {isSale && (
            <>
              <div className="side-section-label">Your workspace</div>
              <div className={`side-item ${topSection === "customer" && subSection === "customer" ? "active" : ""}`} onClick={() => { setTopSection("customer"); setSubSection("customer"); }}>
                <Building2 size={14} /> Customer
                {answeredUnseenCount > 0 && <span className="badge-mini">{answeredUnseenCount}</span>}
              </div>
              <div className={`side-item ${topSection === "customer" && subSection === "orders" ? "active" : ""}`} onClick={() => { setTopSection("customer"); setSubSection("orders"); }}>
                <FileText size={14} /> Order Tracking
                {orderFeedUnseenCount > 0 && <span className="badge-mini">{orderFeedUnseenCount}</span>}
              </div>
            </>
          )}

          {isBuyer && (
            <>
              <div className="side-section-label">Buyer Space</div>
              <div className={`side-item ${topSection === "buyerspace" && buyerSubTab === "feed" ? "active" : ""}`} onClick={() => { setTopSection("buyerspace"); setBuyerSubTab("feed"); }}>
                <Inbox size={14} /> Inbox
                {pendingCount > 0 && <span className="badge-mini">{pendingCount}</span>}
              </div>
              <div className={`side-item ${topSection === "buyerspace" && buyerSubTab === "fulfillment" ? "active" : ""}`} onClick={() => { setTopSection("buyerspace"); setBuyerSubTab("fulfillment"); }}>
                <Truck size={14} /> Orders to update
                {(fulfillmentUnseenCount + openReorderCount) > 0 && <span className="badge-mini">{fulfillmentUnseenCount + openReorderCount}</span>}
              </div>
              <div className={`side-item ${topSection === "buyerspace" && buyerSubTab === "po" ? "active" : ""}`} onClick={() => { setTopSection("buyerspace"); setBuyerSubTab("po"); }}>
                <Package size={14} /> PO Tracking
              </div>
              <div className={`side-item ${topSection === "buyerspace" && buyerSubTab === "jobs" ? "active" : ""}`} onClick={() => { setTopSection("buyerspace"); setBuyerSubTab("jobs"); }}>
                <Briefcase size={14} /> Jobs
              </div>
            </>
          )}

          {isWarehouse && (
            <>
              <div className="side-section-label">Warehouse</div>
              <div className={`side-item ${topSection === "warehouse" ? "active" : ""}`} onClick={() => setTopSection("warehouse")}>
                <Warehouse size={14} /> Warehouse's Space
              </div>
            </>
          )}
          {!isWarehouse && (
            <>
              <div className="side-section-label">Shared</div>
              <div className={`side-item ${topSection === "delivery" ? "active" : ""}`} onClick={() => setTopSection("delivery")}>
                <Ship size={14} /> Container Rate
              </div>
            </>
          )}
          {(isAdmin || isBuyer) && (
            <div className={`side-item ${topSection === "warehouse" ? "active" : ""}`} onClick={() => setTopSection("warehouse")}>
              <Warehouse size={14} /> Warehouse's Space
            </div>
          )}
          {!isWarehouse && (
            <div className={`side-item ${topSection === "agent" ? "active" : ""}`} onClick={() => setTopSection("agent")}>
              <Bot size={14} /> AI agent link
            </div>
          )}
          {(isAdmin || isBuyer) && (
            <div className={`side-item ${topSection === "booking" ? "active" : ""}`} onClick={() => setTopSection("booking")}>
              <Truck size={14} /> Delivery Booking
            </div>
          )}
          {isAdmin && (
            <>
              <div className={`side-item ${topSection === "accounts" ? "active" : ""}`} onClick={() => setTopSection("accounts")}>
                <KeyRound size={14} /> Accounts
              </div>
            </>
          )}

          <div className="side-spacer" />
          <div className="side-user">
            <div className="side-user-name">{user.name}</div>
            <div className="side-user-role">{user.role}</div>
            <button className="logout-btn" onClick={onLogout}><LogOut size={13} /> Log out</button>
          </div>
        </div>

        <div className="main">
          {(isAdmin || isSale) && topSection === "customer" && (
            <>
              <div className="page-header">
                <div>
                  <div className="page-title sm-display">{isAdmin ? selectedRep.name : "Your workspace"}</div>
                  <div className="page-sub">Manage customers, information that needs Buyer confirmation, and PFI orders</div>
                </div>
              </div>
              <div className="pill-tabs">
                <div className={`pill ${subSection === "customer" ? "active" : ""}`} onClick={() => setSubSection("customer")}>Customer</div>
                <div className={`pill ${subSection === "orders" ? "active" : ""}`} onClick={() => setSubSection("orders")}>Order Tracking</div>
              </div>
              {subSection === "customer" && (
                <CustomerTab
                  saleId={currentSaleId}
                  saleName={isAdmin ? selectedRep.name : user.name}
                  customers={currentCustomers}
                  pfisForSale={currentPfis}
                  addCustomer={store.addCustomer}
                  addNote={store.addNote}
                  sendExisting={store.sendExisting}
                  deleteNote={store.deleteNote}
                  markSeen={store.markSeen}
                  onOpenPfi={openPfiFromCustomer}
                />
              )}
              {subSection === "orders" && (
                <PfiList
                  saleId={currentSaleId}
                  saleName={isAdmin ? selectedRep.name : user.name}
                  customers={currentCustomers}
                  pfis={currentPfis}
                  expandedPfiId={expandedPfiId}
                  setExpandedPfiId={setExpandedPfiId}
                  feedSaleForThis={feedSaleForCurrent}
                  actions={store}
                  pos={store.pos}
                  existingNumbers={allPfiNumbers}
                />
              )}
            </>
          )}

          {topSection === "delivery" && (
            <>
              <div className="page-header">
                <div>
                  <div className="page-title sm-display">Container Rate</div>
                  <div className="page-sub">Freight rates by lane — open a lane to see every forwarder quote</div>
                </div>
              </div>
              <ContainerRateTab lanes={store.lanes} actions={store} userName={user.name} canEdit={isAdmin || isBuyer} />
            </>
          )}

          {topSection === "booking" && (isAdmin || isBuyer) && (
            <>
              <div className="page-header">
                <div>
                  <div className="page-title sm-display">Delivery Booking</div>
                  <div className="page-sub">Customer delivery bookings — shared by Admin and Buyer</div>
                </div>
              </div>
              <DeliveryBookingTab bookings={store.bookings} actions={store} />
            </>
          )}

          {topSection === "warehouse" && (isAdmin || isBuyer || isWarehouse) && (
            <>
              <div className="page-header">
                <div>
                  <div className="page-title sm-display">Warehouse's Space</div>
                  <div className="page-sub">Delivery / collection calendar — shared by Admin, Buyer and Warehouse</div>
                </div>
              </div>
              <WarehouseTab events={store.warehouseEvents} actions={store} userName={user.name} />
            </>
          )}

          {topSection === "agent" && !isWarehouse && (
            <>
              <div className="page-header">
                <div>
                  <div className="page-title sm-display">AI agent link</div>
                  <div className="page-sub">Let Claude or ChatGPT (your own subscription) read the console and add lines, jobs and calendar entries for you</div>
                </div>
              </div>
              <AgentLinkTab user={user} accounts={store.accounts} />
            </>
          )}

          {topSection === "mai" && isAdmin && (
            <>
              <div className="page-header">
                <div>
                  <div className="page-title sm-display">Mai</div>
                  <div className="page-sub">Daily tasks to follow up — Admin only</div>
                </div>
              </div>
              <MaiTab tasks={store.maiTasks} actions={store} />
            </>
          )}

          {topSection === "accounts" && isAdmin && (
            <>
              <div className="page-header">
                <div>
                  <div className="page-title sm-display">Accounts</div>
                  <div className="page-sub">Create and remove Sale, Buyer and Admin logins — Admin only</div>
                </div>
              </div>
              <AccountsTab accounts={store.accounts} actions={store} currentUserId={user.id} />
            </>
          )}

          {topSection === "buyerspace" && (isBuyer || isAdmin) && (
            <>
              <div className="page-header">
                <div>
                  <div className="page-title sm-display">Buyer Space{isAdmin ? " — Admin view" : ""}</div>
                  <div className="page-sub">Info requests, PFI orders to fulfill, POs to suppliers, and jobs with Buyer's Notes</div>
                </div>
              </div>
              <div className="pill-tabs">
                <div className={`pill ${buyerSubTab === "feed" ? "active" : ""}`} onClick={() => setBuyerSubTab("feed")}>Inbox</div>
                <div className={`pill ${buyerSubTab === "fulfillment" ? "active" : ""}`} onClick={() => setBuyerSubTab("fulfillment")}>Orders to update</div>
                <div className={`pill ${buyerSubTab === "po" ? "active" : ""}`} onClick={() => setBuyerSubTab("po")}>PO Tracking</div>
                <div className={`pill ${buyerSubTab === "jobs" ? "active" : ""}`} onClick={() => setBuyerSubTab("jobs")}>Jobs</div>
              </div>
              {buyerSubTab === "feed" && <BuyerFeed feed={store.feed} answerFeedItem={store.answerFeedItem} deleteFeedItem={store.deleteFeedItem} />}
              {buyerSubTab === "fulfillment" && <BuyerFulfillment pfisBySale={store.pfisBySale} feedBuyerPfi={store.feedBuyerPfi} actions={store} pos={store.pos} reorders={store.reorders} />}
              {buyerSubTab === "po" && <PoTrackingArea suppliers={store.suppliers} pos={store.pos} actions={store} allPfiOptions={allPfiOptions} />}
              {buyerSubTab === "jobs" && <JobsTab jobs={store.buyerJobs} actions={store} userName={user.name} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const EMPTY_SLICES = {
  customersBySale: {}, feed: [], pfisBySale: {}, feedSale: [], feedBuyerPfi: [],
  suppliers: [], pos: [], lanes: [], reorders: [], bookings: [], accounts: [], maiTasks: [], buyerJobs: [], warehouseEvents: [],
};

export default function App() {
  /* Production: every slice below is loaded from /api/state and each setX persists the changed records. */
  const sync = useSyncStore({
    onRemote: (s) => ({ ...s, pfisBySale: applyReceipts(s.pfisBySale || {}, s.pos || []) }),
  });
  const { user, slices } = sync;
  const slice = (name) => [slices ? slices[name] : EMPTY_SLICES[name], (updater, meta) => sync.setSlice(name, updater, meta)];
  const [customersBySale, setCustomersBySale] = slice("customersBySale");
  const [feed, setFeed] = slice("feed");
  const [pfisBySale, setPfisBySale] = slice("pfisBySale");
  // PFI writes say which role's view made them; the server keeps the other role's fields from its newest copy.
  const setPfisAs = (viewAs) => (updater) => setPfisBySale(updater, { viewAs });
  const [feedSale, setFeedSale] = slice("feedSale");
  const [feedBuyerPfi, setFeedBuyerPfi] = slice("feedBuyerPfi");
  const [suppliers, setSuppliers] = slice("suppliers");
  const [pos, setPos] = slice("pos");
  const [lanes, setLanes] = slice("lanes");
  const [reorders, setReorders] = slice("reorders");
  const [bookings, setBookings] = slice("bookings");
  const [accounts, setAccounts] = slice("accounts");
  const [maiTasks, setMaiTasks] = slice("maiTasks");
  const [buyerJobs, setBuyerJobs] = slice("buyerJobs");
  const [warehouseEvents, setWarehouseEvents] = slice("warehouseEvents");

  /* Mai (admin only): daily follow-up tasks */
  const addMaiTask = (data) => {
    const now = new Date().toISOString();
    const task = { id: uid("mai"), task: (data.task || "").trim(), sale: data.sale || "", supplier: data.supplier || "", status: data.status || "not_started", createdAt: now, updatedAt: now };
    setMaiTasks((prev) => [task, ...(prev || [])]);
    return task.id;
  };
  const updateMaiTask = (id, patch) => setMaiTasks((prev) => (prev || []).map((t) => (t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t)));
  const deleteMaiTask = (id) => setMaiTasks((prev) => (prev || []).filter((t) => t.id !== id));

  /* Jobs (buyer + admin): jobs given to the buyer, each with a thread of Buyer's Notes */
  const addBuyerJob = (data) => {
    const job = { id: uid("job"), givenDate: data.givenDate || todayIso(), jobs: (data.jobs || "").trim(), maiNote: data.maiNote || "", status: data.status || "pending", notes: [], createdAt: new Date().toISOString() };
    setBuyerJobs((prev) => [job, ...(prev || [])]);
    return job.id;
  };
  const updateBuyerJob = (id, patch) => setBuyerJobs((prev) => (prev || []).map((j) => (j.id === id ? { ...j, ...patch } : j)));
  const deleteBuyerJob = (id) => setBuyerJobs((prev) => (prev || []).filter((j) => j.id !== id));
  const addBuyerJobNote = (id, text, by) => {
    if (!text.trim()) return;
    setBuyerJobs((prev) => (prev || []).map((j) => (
      j.id === id ? { ...j, notes: [...(j.notes || []), { id: uid("jnote"), text: text.trim(), statusAtTime: j.status, by, createdAt: new Date().toISOString() }] } : j
    )));
  };

  /* Warehouse's Space (admin + buyer + warehouse): delivery / collection calendar */
  const addWarehouseEvent = (data) => {
    const ev = { id: uid("wh"), date: data.date, title: (data.title || "").trim(), type: data.type || "delivery", refNo: data.refNo || "", note: data.note || "", createdBy: data.createdBy || "", createdAt: new Date().toISOString() };
    setWarehouseEvents((prev) => [...(prev || []), ev]);
    return ev.id;
  };
  const updateWarehouseEvent = (id, patch) => setWarehouseEvents((prev) => (prev || []).map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const deleteWarehouseEvent = (id) => setWarehouseEvents((prev) => (prev || []).filter((e) => e.id !== id));

  const addAccount = (data) => {
    const account = {
      id: uid(data.role === "sale" ? "sale" : data.role),
      role: data.role, name: data.name, username: data.username, password: data.password,
      createdAt: new Date().toISOString(),
    };
    setAccounts((prev) => [...prev, account]);
    return account.id;
  };
  const updateAccount = (id, patch) => setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const deleteAccount = (id) => setAccounts((prev) => prev.filter((a) => a.id !== id));

  const addBooking = () => {
    const id = uid("book");
    setBookings((prev) => [{
      id, customerName: "", saleName: "", docNo: "", pod: "", loadingAddress: "",
      mode: "container", subType: SHIPMENT_SUBTYPES.container[0],
      forwarder: "", currency: "USD", rate: "", method: LOADING_METHODS[0],
      loadingBooked: "", loadingTime: "", etd: "", eta: "", note: "", status: "pending",
      createdAt: new Date().toISOString(),
    }, ...prev]);
    return id;
  };
  const updateBooking = (id, patch) => setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const deleteBooking = (id) => setBookings((prev) => prev.filter((b) => b.id !== id));

  const addLane = (data) => {
    const lane = { id: uid("lane"), ...data, quotes: [], createdAt: new Date().toISOString() };
    setLanes((prev) => [lane, ...prev]);
    return lane.id;
  };
  const deleteLane = (laneId) => setLanes((prev) => prev.filter((l) => l.id !== laneId));
  const addQuote = (laneId, quote) => {
    setLanes((prev) => prev.map((l) => (l.id === laneId ? { ...l, quotes: [...l.quotes, { id: uid("quote"), ...quote }] } : l)));
  };
  const updateQuote = (laneId, quoteId, field, value) => {
    setLanes((prev) => prev.map((l) => (
      l.id !== laneId ? l : { ...l, quotes: l.quotes.map((q) => (q.id === quoteId ? { ...q, [field]: value } : q)) }
    )));
  };
  const deleteQuote = (laneId, quoteId) => {
    setLanes((prev) => prev.map((l) => (l.id !== laneId ? l : { ...l, quotes: l.quotes.filter((q) => q.id !== quoteId) })));
  };

  const pushBuyerPfiFeed = (pfiId, saleId, saleName, customerName, message) => {
    setFeedBuyerPfi((f) => [{ id: uid("bfeed"), pfiId, saleId, saleName, customerName, message, createdAt: new Date().toISOString(), seenByBuyer: false }, ...f]);
  };
  const pushSaleFeed = (saleId, pfiId, customerName, productName, message) => {
    setFeedSale((f) => [{ id: uid("sfeed"), saleId, pfiId, customerName, productName, message, createdAt: new Date().toISOString(), seenBySale: false }, ...f]);
  };

  const addCustomer = (saleId, data) => {
    const newCustomer = {
      id: uid("cust"),
      companyName: data.companyName,
      groupChatName: data.groupChatName,
      productsUsual: data.productsUsual,
      createdAt: new Date().toISOString(),
      notes: [],
    };
    setCustomersBySale((prev) => ({ ...prev, [saleId]: [newCustomer, ...(prev[saleId] || [])] }));
    return newCustomer.id;
  };

  const addNote = (saleId, customerId, content, notifyNow, saleName) => {
    if (!content.trim()) return;
    const now = new Date().toISOString();
    const note = { id: uid("note"), content: content.trim(), status: notifyNow ? "sent" : "draft", notified: notifyNow, answer: "", createdAt: now, answeredAt: null, seenBySale: true };
    const customer = (customersBySale[saleId] || []).find((c) => c.id === customerId);
    setCustomersBySale((prev) => ({
      ...prev,
      [saleId]: (prev[saleId] || []).map((c) => (c.id === customerId ? { ...c, notes: [note, ...c.notes] } : c)),
    }));
    if (notifyNow && customer) {
      setFeed((f) => [{ id: uid("feed"), saleId, saleName, customerId, companyName: customer.companyName, noteId: note.id, content: note.content, status: "sent", answer: "", createdAt: now, answeredAt: null }, ...f]);
    }
  };

  const sendExisting = (saleId, customerId, noteId, saleName) => {
    const now = new Date().toISOString();
    const customer = (customersBySale[saleId] || []).find((c) => c.id === customerId);
    if (!customer) return;
    const target = customer.notes.find((n) => n.id === noteId);
    setCustomersBySale((prev) => ({
      ...prev,
      [saleId]: (prev[saleId] || []).map((c) => (
        c.id === customerId
          ? { ...c, notes: c.notes.map((n) => (n.id === noteId ? { ...n, status: "sent", notified: true } : n)) }
          : c
      )),
    }));
    setFeed((f) => [{ id: uid("feed"), saleId, saleName, customerId, companyName: customer.companyName, noteId, content: target ? target.content : "", status: "sent", answer: "", createdAt: now, answeredAt: null }, ...f]);
  };

  const deleteNote = (saleId, customerId, noteId) => {
    setCustomersBySale((prev) => {
      const list = prev[saleId] || [];
      const nextList = list.map((c) => (c.id === customerId ? { ...c, notes: c.notes.filter((n) => n.id !== noteId) } : c));
      return { ...prev, [saleId]: nextList };
    });
    setFeed((prev) => prev.filter((f) => f.noteId !== noteId));
  };

  const markSeen = (saleId, customerId) => {
    setCustomersBySale((prev) => {
      const list = prev[saleId] || [];
      const nextList = list.map((c) => (c.id === customerId ? { ...c, notes: c.notes.map((n) => (n.status === "answered" ? { ...n, seenBySale: true } : n)) } : c));
      return { ...prev, [saleId]: nextList };
    });
  };

  const answerFeedItem = (feedId, answer) => {
    const now = new Date().toISOString();
    const target = feed.find((f) => f.id === feedId);
    setFeed((prev) => prev.map((f) => (f.id === feedId ? { ...f, status: "answered", answer, answeredAt: now } : f)));
    if (target) {
      setCustomersBySale((prev) => {
        const list = prev[target.saleId] || [];
        const nextList = list.map((c) => (c.id === target.customerId ? { ...c, notes: c.notes.map((n) => (n.id === target.noteId ? { ...n, status: "answered", answer, answeredAt: now, seenBySale: false } : n)) } : c));
        return { ...prev, [target.saleId]: nextList };
      });
    }
  };

  const deleteFeedItem = (feedId) => {
    setFeed((prev) => prev.filter((f) => !(f.id === feedId && f.status === "answered")));
  };

  /* ---- PFI actions (Sale <-> Buyer, both directions notify) ---- */

  const addPfi = (saleId, saleName, data) => {
    const newPfi = {
      id: uid("pfi"), saleId, saleName, pfiNo: data.pfiNo,
      customerId: data.customerId, customerName: data.customerName,
      currency: data.currency, paymentTerm: data.paymentTerm, incoterm: data.incoterm,
      createdAt: new Date().toISOString(),
      products: [], delivery: emptyPfiDelivery(), documents: [], payments: [],
    };
    setPfisAs("sale")((prev) => ({ ...prev, [saleId]: [newPfi, ...(prev[saleId] || [])] }));
    pushBuyerPfiFeed(newPfi.id, saleId, saleName, data.customerName, `Created PFI ${data.pfiNo} — track order status once products are added.`);
    return newPfi.id;
  };

  const addProduct = (saleId, pfiId, row) => {
    const product = {
      id: uid("prod"),
      ean: row.ean || "", caseBarcode: row.caseBarcode || "", product: row.product || "", caseSize: row.caseSize || "", bbd: row.bbd || "",
      quantity: row.quantity || "", rate: row.rate || "", vat: row.vat || VAT_OPTIONS[0], amount: computeAmount(row.quantity, row.rate),
      orderStatus: "not_ordered", estimatedDeliveryDate: "", receivedQuantity: "", receivedDate: "", bbdReceived: "", reorder: false,
    };
    const source = (pfisBySale[saleId] || []).find((p) => p.id === pfiId);
    setPfisAs("sale")((prev) => applyReceipts({
      ...prev,
      [saleId]: (prev[saleId] || []).map((p) => (p.id === pfiId ? { ...p, products: [...p.products, product] } : p)),
    }, pos));
    if (source) pushBuyerPfiFeed(pfiId, saleId, source.saleName, source.customerName, `Added product "${product.product}" to the order.`);
  };

  const addProductsBulk = (saleId, pfiId, rows) => {
    const newProducts = rows.map((row) => ({
      id: uid("prod"),
      ean: row.ean || "", caseBarcode: row.caseBarcode || "", product: row.product || "", caseSize: row.caseSize || "", bbd: row.bbd || "",
      quantity: row.quantity || "", rate: row.rate || "", vat: row.vat || VAT_OPTIONS[0], amount: computeAmount(row.quantity, row.rate),
      orderStatus: "not_ordered", estimatedDeliveryDate: "", receivedQuantity: "", receivedDate: "", bbdReceived: "", reorder: false,
    }));
    const source = (pfisBySale[saleId] || []).find((p) => p.id === pfiId);
    setPfisAs("sale")((prev) => applyReceipts({
      ...prev,
      [saleId]: (prev[saleId] || []).map((p) => (p.id === pfiId ? { ...p, products: [...p.products, ...newProducts] } : p)),
    }, pos));
    if (source) pushBuyerPfiFeed(pfiId, saleId, source.saleName, source.customerName, `Imported ${newProducts.length} product line(s) from Excel.`);
  };

  const deleteProduct = (saleId, pfiId, productId) => {
    setPfisAs("sale")((prev) => {
      const list = prev[saleId] || [];
      const nextList = list.map((p) => (p.id === pfiId ? { ...p, products: p.products.filter((pr) => pr.id !== productId) } : p));
      return { ...prev, [saleId]: nextList };
    });
  };

  const deletePfi = (saleId, pfiId) => {
    const nextPos = pos.map((po) => ({
      ...po,
      products: po.products.map((p) => ({ ...p, linkedPfiRefs: (p.linkedPfiRefs || []).filter((r) => r.pfiId !== pfiId) })),
    }));
    setPos(nextPos);
    setPfisBySale((prev) => applyReceipts({ ...prev, [saleId]: (prev[saleId] || []).filter((p) => p.id !== pfiId) }, nextPos));
    setFeedSale((prev) => prev.filter((f) => f.pfiId !== pfiId));
    setFeedBuyerPfi((prev) => prev.filter((f) => f.pfiId !== pfiId));
  };

  const updateProductSaleField = (saleId, pfiId, productId, field, value) => {
    setPfisAs("sale")((prev) => {
      const list = prev[saleId] || [];
      const nextList = list.map((pfi) => {
        if (pfi.id !== pfiId) return pfi;
        const nextProducts = pfi.products.map((p) => {
          if (p.id !== productId) return p;
          const updated = { ...p, [field]: value };
          if (field === "quantity" || field === "rate") {
            updated.amount = computeAmount(field === "quantity" ? value : updated.quantity, field === "rate" ? value : updated.rate);
          }
          return updated;
        });
        return { ...pfi, products: nextProducts };
      });
      return applyReceipts({ ...prev, [saleId]: nextList }, pos);
    });
  };

  const updateProductBuyerField = (saleId, pfiId, productId, field, value) => {
    const sourcePfi = (pfisBySale[saleId] || []).find((p) => p.id === pfiId);
    const sourceProduct = sourcePfi ? sourcePfi.products.find((p) => p.id === productId) : null;
    setPfisAs("buyer")((prev) => {
      const list = prev[saleId] || [];
      const nextList = list.map((pfi) => {
        if (pfi.id !== pfiId) return pfi;
        const nextProducts = pfi.products.map((p) => {
          if (p.id !== productId) return p;
          const updated = { ...p, [field]: value };
          if (field === "quantity" || field === "rate") {
            updated.amount = computeAmount(field === "quantity" ? value : updated.quantity, field === "rate" ? value : updated.rate);
          }
          return updated;
        });
        return { ...pfi, products: nextProducts };
      });
      return { ...prev, [saleId]: nextList };
    });
    if (sourcePfi && sourceProduct) {
      const label = FIELD_LABEL[field] || field;
      const displayVal = field === "orderStatus" ? ORDER_STATUS_LABEL[value] : value;
      const productName = sourceProduct.product || "(product)";
      pushSaleFeed(saleId, pfiId, sourcePfi.customerName, productName, `Buyer updated ${label} for "${productName}": ${displayVal || "—"}`);
      if (SYNCED_FIELDS.includes(field)) {
        propagateToPos(pfiId, sourceProduct.product, { [field]: value });
      }
    }
  };

  const toggleReorder = (saleId, pfiId, productId) => {
    const sourcePfi = (pfisBySale[saleId] || []).find((p) => p.id === pfiId);
    const sourceProduct = sourcePfi ? sourcePfi.products.find((p) => p.id === productId) : null;
    const turningOn = sourceProduct ? !sourceProduct.reorder : false;

    setPfisAs("sale")((prev) => {
      const list = prev[saleId] || [];
      const nextList = list.map((pfi) => {
        if (pfi.id !== pfiId) return pfi;
        return { ...pfi, products: pfi.products.map((p) => (p.id === productId ? { ...p, reorder: !p.reorder } : p)) };
      });
      return { ...prev, [saleId]: nextList };
    });

    if (!sourcePfi || !sourceProduct) return;

    if (turningOn) {
      const receipts = sourceProduct.receipts || [];
      const receivedSoFar = receipts.length
        ? receipts.reduce((acc, r) => { const v = numOrNull(r.receivedQuantity); return v === null ? acc : acc + v; }, 0)
        : (numOrNull(sourceProduct.receivedQuantity) || 0);
      const shortQty = Math.max(Number(sourceProduct.quantity || 0) - receivedSoFar, 0);
      setReorders((prev) => [{
        id: uid("reord"),
        pfiId, saleId, productId,
        saleName: sourcePfi.saleName, customerName: sourcePfi.customerName, pfiNo: sourcePfi.pfiNo,
        product: sourceProduct.product, ean: sourceProduct.ean, caseBarcode: sourceProduct.caseBarcode,
        caseSize: sourceProduct.caseSize, rate: sourceProduct.rate, shortQty,
        createdAt: new Date().toISOString(), handled: false,
      }, ...prev]);
      pushBuyerPfiFeed(pfiId, saleId, sourcePfi.saleName, sourcePfi.customerName,
        `Reorder requested for "${sourceProduct.product}" — ${shortQty} case(s) short. See Reorder requests.`);
    } else {
      setReorders((prev) => prev.filter((r) => !(r.pfiId === pfiId && r.productId === productId)));
    }
  };

  const summarise = (before, after, allocCount) => {
    const bits = [];
    const b = before ? before.products : [];
    const a = after.products || [];
    const added = a.filter((p) => !b.some((x) => x.id === p.id)).length;
    const removed = b.filter((p) => !a.some((x) => x.id === p.id)).length;
    const strippedLines = (list) => stripDerived({ products: list }).products;
    const sb = strippedLines(b);
    const sa = strippedLines(a);
    const edited = sa.filter((p) => {
      const o = sb.find((x) => x.id === p.id);
      return o && JSON.stringify(o) !== JSON.stringify(p);
    }).length;
    if (added) bits.push(`${added} line(s) added`);
    if (removed) bits.push(`${removed} line(s) removed`);
    if (edited) bits.push(`${edited} line(s) updated`);
    if (allocCount) bits.push(`receipt details on ${allocCount} PO row(s)`);
    if (before && JSON.stringify(before.delivery) !== JSON.stringify(after.delivery)) bits.push("delivery updated");
    if (before && JSON.stringify(before.documents) !== JSON.stringify(after.documents)) bits.push("documents updated");
    if (before && (before.payments || []).length !== (after.payments || []).length) bits.push("payment recorded");
    if (before && before.sentStatus !== after.sentStatus) bits.push(`PO marked ${after.sentStatus === "sent" ? "sent" : "not sent"}`);
    if (before && before.receivedStatus !== after.receivedStatus) bits.push(`goods marked ${after.receivedStatus === "received" ? "received" : "not received"}`);
    return bits.join(", ");
  };

  const savePfi = (input, allocPatches, reorderToggles, byRole) => {
    const saleId = input.saleId;
    const before = (pfisBySale[saleId] || []).find((p) => p.id === input.id);
    const draft = mergeOtherRole(input, before, byRole); // never write the other role's fields from a stale draft

    let nextPos = pos;
    if (allocPatches.length) {
      nextPos = pos.map((po) => ({
        ...po,
        products: po.products.map((pr) => {
          const mine = allocPatches.filter((x) => x.poLineId === pr.id);
          if (mine.length === 0) return pr;
          return {
            ...pr,
            linkedPfiRefs: (pr.linkedPfiRefs || []).map((ref) => {
              const forRef = mine.filter((x) => x.pfiId === ref.pfiId);
              return forRef.length ? forRef.reduce((acc, x) => ({ ...acc, [x.field]: x.value }), ref) : ref;
            }),
          };
        }),
      }));
      setPos(nextPos);
    }

    const cleaned = stripDerived(draft);
    const nextPfis = {
      ...pfisBySale,
      [saleId]: (pfisBySale[saleId] || []).map((p) => (p.id === draft.id ? cleaned : p)),
    };
    setPfisAs(byRole)(applyReceipts(nextPfis, nextPos));

    (reorderToggles || []).forEach((t) => {
      const existing = reorders.find((r) => r.pfiId === draft.id && r.productId === t.productId && (r.poLineId || null) === (t.poLineId || null));
      if (existing) {
        setReorders((prev) => prev.filter((r) => r.id !== existing.id));
        return;
      }
      const line = draft.products.find((p) => p.id === t.productId);
      if (!line) return;
      setReorders((prev) => [{
        id: uid("reord"),
        pfiId: draft.id, saleId, productId: t.productId, poLineId: t.poLineId || null, poNo: t.poNo || null,
        saleName: draft.saleName, customerName: draft.customerName, pfiNo: draft.pfiNo,
        product: line.product, ean: line.ean, caseBarcode: line.caseBarcode, caseSize: line.caseSize,
        rate: line.rate, shortQty: t.shortQty,
        createdAt: new Date().toISOString(), handled: false,
      }, ...prev]);
    });

    const summary = summarise(before, draft, allocPatches.length);
    const reorderCount = (reorderToggles || []).length;
    const parts = [summary, reorderCount ? `${reorderCount} reorder request(s) changed` : ""].filter(Boolean).join(", ");
    if (!parts) return;
    if (byRole === "sale") {
      pushBuyerPfiFeed(draft.id, saleId, draft.saleName, draft.customerName, `Sale saved ${pfiLabel(draft)}: ${parts}.`);
    } else {
      pushSaleFeed(saleId, draft.id, draft.customerName, "Order", `Buyer saved ${pfiLabel(draft)}: ${parts}.`);
    }
  };

  // Row-level changes on a PO, grouped by the PFI they belong to: "product": status …, received …
  const refChangesByPfi = (before, after) => {
    const out = new Map();
    (after.products || []).forEach((prod) => {
      const b = before && before.products.find((x) => x.id === prod.id);
      (prod.linkedPfiRefs || []).forEach((ref) => {
        const bref = b && (b.linkedPfiRefs || []).find((r) => r.pfiId === ref.pfiId);
        const bits = [];
        if (!bref) bits.push(`linked${ref.allocatedQty ? `, ${ref.allocatedQty} cases` : ""}`);
        else {
          if ((bref.orderStatus || "") !== (ref.orderStatus || "")) bits.push(`status ${ORDER_STATUS_LABEL[ref.orderStatus] || ref.orderStatus}`);
          if (String(bref.receivedQty ?? "") !== String(ref.receivedQty ?? "")) bits.push(`received ${ref.receivedQty === "" ? "—" : ref.receivedQty} of ${ref.allocatedQty || prod.quantity || "?"}`);
          if (String(bref.allocatedQty ?? "") !== String(ref.allocatedQty ?? "")) bits.push(`${ref.allocatedQty || 0} cases allocated`);
          if ((bref.estimatedDeliveryDate || "") !== (ref.estimatedDeliveryDate || "")) bits.push(`est. delivery ${fmtDate(ref.estimatedDeliveryDate) || "—"}`);
          if ((bref.receivedDate || "") !== (ref.receivedDate || "")) bits.push(`received on ${fmtDate(ref.receivedDate) || "—"}`);
          if ((bref.bbdReceived || "") !== (ref.bbdReceived || "")) bits.push(`BBD ${fmtDate(ref.bbdReceived) || "—"}`);
          if ((bref.pfiProductId || "") !== (ref.pfiProductId || "")) bits.push("attached to a PFI line");
        }
        if (!bits.length) return;
        const key = `${ref.saleId}:${ref.pfiId}`;
        if (!out.has(key)) out.set(key, []);
        out.get(key).push(`"${prod.product}": ${bits.join(", ")}`);
      });
    });
    return out;
  };

  const savePo = (input) => {
    // Every saved link names its PFI line: fill in the auto-match for refs that never had one.
    const linesOf = (ref) => ((pfisBySale[ref.saleId] || []).find((x) => x.id === ref.pfiId) || {}).products || [];
    const draft = {
      ...input,
      products: (input.products || []).map((p) => ({
        ...p,
        linkedPfiRefs: (p.linkedPfiRefs || []).map((ref) => {
          if (ref.pfiProductId != null) return ref; // explicit line or explicit "no line"
          const match = matchPfiLine(linesOf(ref), null, p);
          return match ? { ...ref, pfiProductId: match } : ref; // no match yet: stay automatic so a later PFI line can still attach
        }),
      })),
    };
    const before = pos.find((p) => p.id === draft.id);
    const nextPos = pos.map((p) => (p.id === draft.id ? draft : p));
    commitPos(nextPos);

    const summary = summarise(before, draft, 0);
    if (!summary) return draft;
    const topButtons = before && (before.sentStatus !== draft.sentStatus || before.receivedStatus !== draft.receivedStatus);
    const rowChanges = refChangesByPfi(before, draft);
    const notified = new Set();
    draft.products.forEach((prod) => {
      (prod.linkedPfiRefs || []).forEach((ref) => {
        const key = `${ref.saleId}:${ref.pfiId}`;
        if (notified.has(key)) return;
        notified.add(key);
        const pfi = (pfisBySale[ref.saleId] || []).find((x) => x.id === ref.pfiId);
        const rows = rowChanges.get(key) || [];
        const message = !topButtons && rows.length
          ? `Buyer updated ${poLabel(draft)} for ${pfi ? pfiLabel(pfi) : "this PFI"} — ${rows.slice(0, 4).join("; ")}${rows.length > 4 ? `; +${rows.length - 4} more` : ""}.`
          : `Buyer saved ${poLabel(draft)}: ${summary}.`;
        pushSaleFeed(ref.saleId, ref.pfiId, pfi ? pfi.customerName : "", "Order", message);
      });
    });
    return draft;
  };

  const markReorderHandled = (reorderId) => {
    setReorders((prev) => prev.map((r) => (r.id === reorderId ? { ...r, handled: true } : r)));
  };

  const dismissReorder = (reorderId) => {
    setReorders((prev) => prev.filter((r) => r.id !== reorderId));
  };

  const updateDelivery = (saleId, pfiId, patch, byRole) => {
    const source = (pfisBySale[saleId] || []).find((p) => p.id === pfiId);
    setPfisAs(byRole)((prev) => ({
      ...prev,
      [saleId]: (prev[saleId] || []).map((p) => (p.id === pfiId ? { ...p, delivery: { ...p.delivery, ...patch } } : p)),
    }));
    if (!source) return;
    const nextType = patch.type || source.delivery.type;
    const what = patch.type
      ? `set the delivery type to "${PFI_DELIVERY_TYPES.find((t) => t.value === patch.type)?.label}"`
      : patch.etd || patch.eta
        ? "updated ETD / ETA"
        : nextType === "collection"
          ? "updated the customer collection date/time"
          : "updated the booking and loading details";
    if (byRole === "sale") {
      pushBuyerPfiFeed(pfiId, saleId, source.saleName, source.customerName, `Sale ${what}.`);
    } else {
      pushSaleFeed(saleId, pfiId, source.customerName, "Delivery", `Buyer ${what}.`);
    }
  };

  const addDocument = (saleId, pfiId, doc) => {
    const source = (pfisBySale[saleId] || []).find((p) => p.id === pfiId);
    setPfisAs("sale")((prev) => ({
      ...prev,
      [saleId]: (prev[saleId] || []).map((p) => (p.id === pfiId ? { ...p, documents: [doc, ...p.documents] } : p)),
    }));
    if (source) pushBuyerPfiFeed(pfiId, saleId, source.saleName, source.customerName, `Requested document: ${doc.type}.`);
  };

  const updateDocumentStatus = (saleId, pfiId, docId, status) => {
    const source = (pfisBySale[saleId] || []).find((p) => p.id === pfiId);
    setPfisAs("buyer")((prev) => ({
      ...prev,
      [saleId]: (prev[saleId] || []).map((p) => (p.id === pfiId ? { ...p, documents: p.documents.map((d) => (d.id === docId ? { ...d, status } : d)) } : p)),
    }));
    if (source) pushSaleFeed(saleId, pfiId, source.customerName, "Document", `Buyer set a document status to "${DOC_STATUS_LABEL[status]}".`);
  };

  const addPayment = (saleId, pfiId, payment) => {
    setPfisAs("sale")((prev) => {
      const list = prev[saleId] || [];
      const nextList = list.map((p) => (p.id === pfiId ? { ...p, payments: [...p.payments, payment] } : p));
      return { ...prev, [saleId]: nextList };
    });
  };

  const markOrderFeedSeen = (saleId, pfiId) => {
    setFeedSale((prev) => prev.map((f) => (f.saleId === saleId && f.pfiId === pfiId ? { ...f, seenBySale: true } : f)));
  };

  const markPfiFeedBuyerSeen = (pfiId) => {
    setFeedBuyerPfi((prev) => prev.map((f) => (f.pfiId === pfiId ? { ...f, seenByBuyer: true } : f)));
  };

  /* ---- PO actions (Buyer <-> Supplier) ---- */
  /* Every PO change goes through commitPos, which re-mirrors PO lines onto the
     linked PFI lines as per-PO sub-rows, so a PFI line shows one row per PO. */

  const commitPos = (nextPos) => {
    setPos(nextPos);
    setPfisBySale((prev) => applyReceipts(prev, nextPos));
  };

  const addSupplier = (data) => {
    const supplier = { id: uid("sup"), name: data.name, note: data.note, createdAt: new Date().toISOString() };
    setSuppliers((prev) => [supplier, ...prev]);
    return supplier.id;
  };

  const addPo = (data) => {
    const newPo = {
      id: uid("po"), poNo: data.poNo, supplierId: data.supplierId, supplierName: data.supplierName,
      currency: data.currency, paymentTerm: data.paymentTerm, incoterm: data.incoterm,
      createdAt: new Date().toISOString(),
      products: [], delivery: emptyPoDelivery(), documents: [], payments: [],
      sentStatus: "not_sent", receivedStatus: "not_received",
    };
    commitPos([newPo, ...pos]);
    return newPo.id;
  };

  const deletePo = (poId) => {
    commitPos(pos.filter((p) => p.id !== poId));
  };

  const blankPoLine = (row) => ({
    id: uid("prod"),
    ean: row.ean || "", caseBarcode: row.caseBarcode || "", product: row.product || "", caseSize: row.caseSize || "", bbd: row.bbd || "",
    quantity: row.quantity || "", rate: row.rate || "", vat: row.vat || VAT_OPTIONS[0], amount: computeAmount(row.quantity, row.rate),
    orderStatus: "not_ordered", estimatedDeliveryDate: "", receivedQuantity: "", receivedDate: "", bbdReceived: "", reorder: false,
    linkedPfiRefs: [],
  });

  const addPoProduct = (poId, row) => {
    commitPos(pos.map((p) => (p.id === poId ? { ...p, products: [...p.products, blankPoLine(row)] } : p)));
  };

  const addPoProductsBulk = (poId, rows) => {
    const newProducts = rows.map(blankPoLine);
    commitPos(pos.map((p) => (p.id === poId ? { ...p, products: [...p.products, ...newProducts] } : p)));
  };

  const deletePoProduct = (poId, productId) => {
    commitPos(pos.map((p) => (p.id === poId ? { ...p, products: p.products.filter((pr) => pr.id !== productId) } : p)));
  };

  const propagateToPos = (pfiId, productName, patch) => {
    commitPos(pos.map((po) => ({
      ...po,
      products: po.products.map((p) => (
        (p.linkedPfiRefs || []).some((r) => r.pfiId === pfiId) && sameName(p.product, productName)
          ? { ...p, ...patch }
          : p
      )),
    })));
  };

  const notifyLinkedSales = (po, productName, refs, message) => {
    (refs || []).forEach((ref) => {
      const pfi = (pfisBySale[ref.saleId] || []).find((x) => x.id === ref.pfiId);
      pushSaleFeed(ref.saleId, ref.pfiId, pfi ? pfi.customerName : "", productName, message);
    });
  };

  const updatePoProductField = (poId, productId, field, value) => {
    const sourcePo = pos.find((p) => p.id === poId);
    const sourceProduct = sourcePo ? sourcePo.products.find((p) => p.id === productId) : null;

    commitPos(pos.map((po) => {
      if (po.id !== poId) return po;
      return {
        ...po,
        products: po.products.map((p) => {
          if (p.id !== productId) return p;
          const updated = { ...p, [field]: value };
          if (field === "quantity" || field === "rate") {
            updated.amount = computeAmount(field === "quantity" ? value : updated.quantity, field === "rate" ? value : updated.rate);
          }
          return updated;
        }),
      };
    }));

    if (sourcePo && sourceProduct && (SYNCED_FIELDS.includes(field) || field === "orderStatus")) {
      const label = field === "orderStatus" ? "Order status" : FIELD_LABEL[field] || field;
      const shown = field === "orderStatus" ? ORDER_STATUS_LABEL[value] : value;
      notifyLinkedSales(sourcePo, sourceProduct.product, sourceProduct.linkedPfiRefs,
        `${poLabel(sourcePo)} — ${label} for "${sourceProduct.product}": ${shown || "—"}`);
    }
  };

  const togglePoProductPfiLink = (poId, productId, opt) => {
    commitPos(pos.map((po) => {
      if (po.id !== poId) return po;
      return {
        ...po,
        products: po.products.map((p) => {
          if (p.id !== productId) return p;
          const existing = p.linkedPfiRefs || [];
          const already = existing.some((r) => r.pfiId === opt.pfiId);
          const nextRefs = already
            ? existing.filter((r) => r.pfiId !== opt.pfiId)
            : [...existing, {
              pfiId: opt.pfiId, saleId: opt.saleId, allocatedQty: "", receivedQty: "",
              orderStatus: p.orderStatus || "not_ordered", estimatedDeliveryDate: "", receivedDate: "", bbdReceived: "",
            }];
          return { ...p, linkedPfiRefs: nextRefs };
        }),
      };
    }));
  };

  const updatePoAllocation = (poId, productId, pfiId, field, value) => {
    const sourcePo = pos.find((p) => p.id === poId);
    const sourceProduct = sourcePo ? sourcePo.products.find((p) => p.id === productId) : null;
    commitPos(pos.map((po) => (
      po.id !== poId ? po : {
        ...po,
        products: po.products.map((p) => (
          p.id !== productId ? p : {
            ...p,
            linkedPfiRefs: (p.linkedPfiRefs || []).map((r) => (r.pfiId === pfiId ? { ...r, [field]: value } : r)),
          }
        )),
      }
    )));
    if (sourcePo && sourceProduct) {
      const ref = (sourceProduct.linkedPfiRefs || []).find((r) => r.pfiId === pfiId);
      if (ref) {
        const pfi = (pfisBySale[ref.saleId] || []).find((x) => x.id === pfiId);
        const label = field === "receivedQty" ? "Received qty"
          : field === "allocatedQty" ? "Allocated cases"
            : field === "orderStatus" ? "Order status"
              : FIELD_LABEL[field] || field;
        const shown = field === "orderStatus" ? ORDER_STATUS_LABEL[value] : value;
        pushSaleFeed(ref.saleId, pfiId, pfi ? pfi.customerName : "", sourceProduct.product,
          `${poLabel(sourcePo)} — ${label} for "${sourceProduct.product}": ${shown || "—"}`);
      }
    }
  };

  const togglePoReorder = (poId, productId) => {
    commitPos(pos.map((po) => (
      po.id !== poId ? po : { ...po, products: po.products.map((p) => (p.id === productId ? { ...p, reorder: !p.reorder } : p)) }
    )));
  };

  const updatePoDelivery = (poId, patch) => {
    setPos((prev) => prev.map((p) => (p.id === poId ? { ...p, delivery: { ...p.delivery, ...patch } } : p)));
  };

  const addPoPayment = (poId, payment) => {
    setPos((prev) => prev.map((p) => (p.id === poId ? { ...p, payments: [...p.payments, payment] } : p)));
  };

  const setPoLineStatus = (poId, orderStatus, extraPatch) => {
    commitPos(pos.map((po) => (
      po.id !== poId ? po : {
        ...po,
        ...extraPatch,
        products: po.products.map((p) => ({
          ...p,
          orderStatus,
          linkedPfiRefs: (p.linkedPfiRefs || []).map((r) => ({ ...r, orderStatus })),
        })),
      }
    )));
  };

  const setPoSentStatus = (poId, sentStatus) => {
    const sourcePo = pos.find((p) => p.id === poId);
    if (!sourcePo) return;
    const orderStatus = sourcePo.receivedStatus === "received"
      ? "received"
      : sentStatus === "sent" ? "ordered" : "sending_order";
    setPoLineStatus(poId, orderStatus, { sentStatus });
  };

  const setPoReceivedStatus = (poId, receivedStatus) => {
    const sourcePo = pos.find((p) => p.id === poId);
    if (!sourcePo) return;
    const orderStatus = receivedStatus === "received"
      ? "received"
      : sourcePo.sentStatus === "sent" ? "ordered" : "sending_order";
    setPoLineStatus(poId, orderStatus, { receivedStatus });
    sourcePo.products.forEach((prod) => {
      notifyLinkedSales(sourcePo, prod.product, prod.linkedPfiRefs,
        receivedStatus === "received"
          ? `${poLabel(sourcePo)} — "${prod.product}" marked received. Check the quantity and BBD on that PO row.`
          : `${poLabel(sourcePo)} — "${prod.product}" reopened, no longer marked received.`);
    });
  };

  const store = {
    customersBySale, feed, pfisBySale, feedSale, feedBuyerPfi, suppliers, pos, lanes, reorders, bookings,
    addBooking, updateBooking, deleteBooking,
    accounts, addAccount, updateAccount, deleteAccount,
    maiTasks, addMaiTask, updateMaiTask, deleteMaiTask,
    buyerJobs, addBuyerJob, updateBuyerJob, deleteBuyerJob, addBuyerJobNote,
    warehouseEvents, addWarehouseEvent, updateWarehouseEvent, deleteWarehouseEvent,
    markReorderHandled, dismissReorder, savePfi, savePo,
    addLane, deleteLane, addQuote, updateQuote, deleteQuote,
    addCustomer, addNote, sendExisting, deleteNote, markSeen, answerFeedItem, deleteFeedItem,
    addPfi, deletePfi, addProduct, addProductsBulk, deleteProduct, updateProductSaleField, updateProductBuyerField,
    toggleReorder, updateDelivery, addDocument, updateDocumentStatus,
    addPayment, markOrderFeedSeen, markPfiFeedBuyerSeen,
    addSupplier, addPo, deletePo, addPoProduct, addPoProductsBulk, deletePoProduct,
    updatePoProductField, togglePoProductPfiLink, updatePoAllocation, togglePoReorder, updatePoDelivery, addPoPayment,
    setPoSentStatus, setPoReceivedStatus,
  };

  if (user === undefined) return null;
  if (!user) return <LoginScreen onLogin={sync.login} />;
  if (!slices) return null;
  return <Shell user={user} onLogout={sync.logout} store={store} />;
}
