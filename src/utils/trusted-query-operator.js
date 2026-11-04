import mongoose from 'mongoose';

export const trustedQueryOperator = (operator) => mongoose.trusted(operator);
