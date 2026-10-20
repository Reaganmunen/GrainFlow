const { Grain, Grade, Unit, PriceTier } = require('./Catalogue');

module.exports = {
  // security & settings
  User: require('./User'),
  Role: require('./Role'),
  Session: require('./Session'),
  ActivityLog: require('./ActivityLog'),
  BackupLog: require('./BackupLog'),
  Settings: require('./Settings'),
  // people
  Customer: require('./Customer'),
  Supplier: require('./Supplier'),
  // catalogue & prices
  Grain, Grade, Unit, PriceTier,
  Item: require('./Item'),
  Price: require('./Price'),
  MillingRate: require('./MillingRate'),
  YieldStandard: require('./YieldStandard'),
  // stock & purchasing
  Stock: require('./Stock'),
  StockAdjustment: require('./StockAdjustment'),
  StockTake: require('./StockTake'),
  Purchase: require('./Purchase'),
  SupplierPayment: require('./SupplierPayment'),
  Transfer: require('./Transfer'),
  // mill
  Machine: require('./Machine'),
  MillJob: require('./MillJob'),
  YieldAlert: require('./YieldAlert'),
  // sales & money
  Sale: require('./Sale'),
  Payment: require('./Payment'),
  Receipt: require('./Receipt'),
  Delivery: require('./Delivery'),
  Expense: require('./Expense'),
  DailyClose: require('./DailyClose'),
  Report: require('./Report'),
};
