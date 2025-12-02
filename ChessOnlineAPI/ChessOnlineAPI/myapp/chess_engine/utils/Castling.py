import json


class CastlingRules():
    def __init__(self, cH, cK, bH, bK):
        self.cH = cH
        self.cK = cK
        self.bH = bH
        self.bK = bK

    def serialize(self):
        return {
            "cH": self.cH,
            "cK": self.cK,
            "bH": self.bH,
            "bK": self.bK
        }

    @staticmethod
    def deserialize(data):
        return CastlingRules(
            data["cH"],
            data["cK"],
            data["bH"],
            data["bK"]
        )